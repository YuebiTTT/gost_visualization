const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let tray = null;
let tasks = new Map();
const tasksFilePath = path.join(app.getPath('userData'), 'tasks.json');

function saveTasks() {
  try {
    const tasksToSave = [];
    tasks.forEach((task, id) => {
      tasksToSave.push({
        id,
        name: task.name,
        config: task.config,
        status: task.status
      });
    });
    fs.writeFileSync(tasksFilePath, JSON.stringify(tasksToSave, null, 2));
    console.log('Tasks saved successfully');
  } catch (error) {
    console.error('Error saving tasks:', error);
  }
}

function loadTasks() {
  try {
    if (fs.existsSync(tasksFilePath)) {
      const savedTasks = JSON.parse(fs.readFileSync(tasksFilePath, 'utf8'));
      savedTasks.forEach(taskData => {
        tasks.set(taskData.id, {
          id: taskData.id,
          name: taskData.name,
          config: taskData.config,
          status: '已停止', // 启动时所有任务都设置为已停止状态
          process: null,
          url: ''
        });
      });
      console.log('Tasks loaded successfully:', savedTasks.length);
    }
  } catch (error) {
    console.error('Error loading tasks:', error);
  }
}

function createWindow() {
  // 设置窗口图标
  const { nativeImage } = require('electron');
  let windowIcon;
  try {
    windowIcon = nativeImage.createFromPath(path.join(__dirname, 'public', 'app-icon.png'));
  } catch (error) {
    windowIcon = nativeImage.createEmpty();
  }

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL('http://localhost:5173/');

  // 关闭窗口时最小化至任务栏
  mainWindow.on('close', function(event) {
    event.preventDefault();
    mainWindow.hide();
  });

  // 创建系统托盘图标
  createTray();
}

function createTray() {
  try {
    // 使用网络图标
    const { nativeImage } = require('electron');
    const iconUrl = 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=A%20modern%20flat%20design%20icon%20for%20a%20network%20proxy%20tool%2C%20featuring%20a%20globe%20with%20network%20connections%2C%20blue%20and%20green%20colors%2C%20clean%20lines%2C%20suitable%20for%20a%20Windows%20application%20tray%20icon&image_size=square_hd';
    
    // 使用本地文件作为备用图标
    const iconPath = path.join(__dirname, 'public', 'app-icon.png');
    
    let trayIcon;
    try {
      // 尝试使用本地图标
      trayIcon = nativeImage.createFromPath(iconPath);
    } catch (error) {
      // 如果本地图标加载失败，使用空图标
      trayIcon = nativeImage.createEmpty();
    }
    
    tray = new Tray(trayIcon);
    
    // 创建右键菜单
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '打开窗口',
        click: function() {
          mainWindow.show();
        }
      },
      {
        label: '停止服务',
        click: function() {
          tasks.forEach((task, id) => {
            if (task.process) {
              task.process.kill();
              task.status = '已停止';
              sendTaskStatus(id, '已停止');
            }
          });
          sendTaskList();
        }
      },
      {
        label: '退出',
        click: function() {
          // 停止所有任务
          tasks.forEach((task, id) => {
            if (task.process) {
              task.process.kill();
            }
          });
          
          // 销毁托盘图标
          if (tray) {
            tray.destroy();
          }
          
          // 强制退出应用程序
          app.exit();
        }
      }
    ]);
    
    // 设置托盘图标提示
    tray.setToolTip('Gost Visualization');
    
    // 设置右键菜单
    tray.setContextMenu(contextMenu);
    
    // 左键点击托盘图标显示窗口
    tray.on('click', function() {
      mainWindow.show();
    });
  } catch (error) {
    console.error('创建托盘图标失败:', error);
  }
}

function sendLog(taskId, message) {
  if (mainWindow) {
    mainWindow.webContents.send('log', { taskId, message });
  }
}

function sendTaskStatus(taskId, status) {
  if (mainWindow) {
    mainWindow.webContents.send('task-status', { taskId, status });
  }
}

function sendTaskInfo(taskId, info) {
  if (mainWindow) {
    mainWindow.webContents.send('task-info', { taskId, info });
  }
}

function sendTaskList() {
  if (mainWindow) {
    const taskList = [];
    tasks.forEach((task, id) => {
      taskList.push({
        id,
        name: task.name,
        status: task.status,
        config: task.config,
        url: task.url
      });
    });
    mainWindow.webContents.send('task-list', taskList);
  }
}

function generateTaskId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

ipcMain.on('create-task', (event, config) => {
  const taskId = generateTaskId();
  const gostPath = path.join(__dirname, 'gost.exe');
  
  let args = [];
  let url = '';
  
  if (config.mode === 'portmap') {
    // 端口映射模式
    if (config.targetAddr && config.targetPort) {
      args = ['-L', `tcp://:${config.localPort}/${config.targetAddr}:${config.targetPort}`];
      url = `tcp://localhost:${config.localPort}`;
    } else {
      sendLog(taskId, '错误: 端口映射模式需要设置映射目标地址和端口');
      sendTaskStatus(taskId, '启动失败');
      return;
    }
  } else {
    // 代理模式
    let localAddr = config.localProto;
    if (localAddr === 'http' || localAddr === 'https') {
      localAddr += '://';
    }
    args = ['-L', `${localAddr}:${config.localPort}`];
    url = `${config.localProto}://localhost:${config.localPort}`;
    
    if (config.remoteProto && config.remoteAddr && config.remotePort) {
      let remoteAddr = config.remoteProto;
      if (remoteAddr === 'http' || remoteAddr === 'https') {
        remoteAddr += '://';
      }
      args.push('-F', `${remoteAddr}${config.remoteAddr}:${config.remotePort}`);
    }
  }
  
  if (config.debug) {
    args.push('-D');
  }
  
  if (config.interface) {
    args.push('-I', config.interface);
  }
  
  sendLog(taskId, `创建任务: ${taskId}`);
  sendLog(taskId, `启动命令: ${gostPath} ${args.join(' ')}`);
  
  try {
    const process = spawn(gostPath, args);
    
    const task = {
      id: taskId,
      name: config.name || `任务 ${taskId.substring(0, 6)}`,
      process,
      status: '运行中',
      config,
      url: url
    };
    
    tasks.set(taskId, task);
    saveTasks();
    
    // 恢复 stdout 和 stderr 事件监听器，显示 Gost 进程的运行结果
    // 这些日志会显示在任务的独立日志区域中
    
    process.stdout.on('data', (data) => {
      sendLog(taskId, data.toString().trim());
    });
    
    process.stderr.on('data', (data) => {
      const message = data.toString().trim();
      // 检查是否为正常日志信息，不是真正的错误
      if (
        message.includes('route.go:700:') && message.includes('on [::]:') ||
        message.includes('[http]') && (message.includes('->') || message.includes('<->')) ||
        message.includes('[route]') && message.includes('->') ||
        message.includes('[tcp]') && (message.includes('->') || message.includes('<->'))
      ) {
        sendLog(taskId, message);
      } else {
        sendLog(taskId, `错误: ${message}`);
      }
    });
    
    process.on('close', (code) => {
      sendLog(taskId, `进程已关闭，退出码: ${code}`);
      task.status = '已停止';
      sendTaskStatus(taskId, '已停止');
      sendTaskList();
      task.process = null;
    });
    
    sendTaskStatus(taskId, '运行中');
    sendTaskInfo(taskId, {
      url: task.url,
      pid: process.pid
    });
    sendLog(taskId, '任务启动成功');
    sendTaskList();
  } catch (error) {
    sendLog(taskId, `启动任务失败: ${error.message}`);
    sendTaskStatus(taskId, '启动失败');
  }
});

ipcMain.on('stop-task', (event, taskId) => {
  const task = tasks.get(taskId);
  if (task && task.process) {
    sendLog(taskId, '停止任务');
    task.process.kill();
    task.status = '已停止';
    sendTaskStatus(taskId, '已停止');
    sendTaskList();
    sendLog(taskId, '任务已停止');
  } else {
    sendLog(taskId, '任务未运行');
  }
});

ipcMain.on('remove-task', (event, taskId) => {
  const task = tasks.get(taskId);
  if (task) {
    if (task.process) {
      task.process.kill();
    }
    tasks.delete(taskId);
    saveTasks();
    sendTaskList();
    sendLog(taskId, '任务已移除');
  }
});

ipcMain.on('start-task', (event, taskId) => {
  const task = tasks.get(taskId);
  if (task && !task.process) {
    const config = task.config;
    const gostPath = path.join(__dirname, 'gost.exe');
    
    let args = [];
    let url = '';
    
    if (config.mode === 'portmap') {
      // 端口映射模式
      if (config.targetAddr && config.targetPort) {
        args = ['-L', `tcp://:${config.localPort}/${config.targetAddr}:${config.targetPort}`];
        url = `tcp://localhost:${config.localPort}`;
      } else {
        sendLog(taskId, '错误: 端口映射模式需要设置映射目标地址和端口');
        sendTaskStatus(taskId, '启动失败');
        return;
      }
    } else {
      // 代理模式
      let localAddr = config.localProto;
      if (localAddr === 'http' || localAddr === 'https') {
        localAddr += '://';
      }
      args = ['-L', `${localAddr}:${config.localPort}`];
      url = `${config.localProto}://localhost:${config.localPort}`;
      
      if (config.remoteProto && config.remoteAddr && config.remotePort) {
        let remoteAddr = config.remoteProto;
        if (remoteAddr === 'http' || remoteAddr === 'https') {
          remoteAddr += '://';
        }
        args.push('-F', `${remoteAddr}${config.remoteAddr}:${config.remotePort}`);
      }
    }
    
    if (config.debug) {
      args.push('-D');
    }
    
    if (config.interface) {
      args.push('-I', config.interface);
    }
    
    sendLog(taskId, `启动任务: ${taskId}`);
    sendLog(taskId, `启动命令: ${gostPath} ${args.join(' ')}`);
    
    try {
      const process = spawn(gostPath, args);
      
      task.process = process;
      task.status = '运行中';
      task.url = url;
      
      process.stdout.on('data', (data) => {
        sendLog(taskId, data.toString().trim());
      });
      
      process.stderr.on('data', (data) => {
        const message = data.toString().trim();
        if (
          message.includes('route.go:700:') && message.includes('on [::]:') ||
          message.includes('[http]') && (message.includes('->') || message.includes('<->')) ||
          message.includes('[route]') && message.includes('->') ||
          message.includes('[tcp]') && (message.includes('->') || message.includes('<->'))
        ) {
          sendLog(taskId, message);
        } else {
          sendLog(taskId, `错误: ${message}`);
        }
      });
      
      process.on('close', (code) => {
        sendLog(taskId, `进程已关闭，退出码: ${code}`);
        task.status = '已停止';
        sendTaskStatus(taskId, '已停止');
        sendTaskList();
        task.process = null;
      });
      
      sendTaskStatus(taskId, '运行中');
      sendTaskInfo(taskId, {
        url: task.url,
        pid: process.pid
      });
      sendLog(taskId, '任务启动成功');
      sendTaskList();
    } catch (error) {
      sendLog(taskId, `启动任务失败: ${error.message}`);
      sendTaskStatus(taskId, '启动失败');
    }
  } else if (task && task.process) {
    sendLog(taskId, '任务已经在运行中');
  } else {
    sendLog(taskId, '任务不存在');
  }
});

ipcMain.on('get-task-list', (event) => {
  sendTaskList();
});

ipcMain.on('start-all-tasks', (event) => {
  tasks.forEach((task, id) => {
    if (task.status !== '运行中' && !task.process) {
      const config = task.config;
      const gostPath = path.join(__dirname, 'gost.exe');
      
      let args = [];
      let url = '';
      
      if (config.mode === 'portmap') {
        // 端口映射模式
        if (config.targetAddr && config.targetPort) {
          args = ['-L', `tcp://:${config.localPort}/${config.targetAddr}:${config.targetPort}`];
          url = `tcp://localhost:${config.localPort}`;
        } else {
          sendLog(id, '错误: 端口映射模式需要设置映射目标地址和端口');
          sendTaskStatus(id, '启动失败');
          return;
        }
      } else {
        // 代理模式
        let localAddr = config.localProto;
        if (localAddr === 'http' || localAddr === 'https') {
          localAddr += '://';
        }
        args = ['-L', `${localAddr}:${config.localPort}`];
        url = `${config.localProto}://localhost:${config.localPort}`;
        
        if (config.remoteProto && config.remoteAddr && config.remotePort) {
          let remoteAddr = config.remoteProto;
          if (remoteAddr === 'http' || remoteAddr === 'https') {
            remoteAddr += '://';
          }
          args.push('-F', `${remoteAddr}${config.remoteAddr}:${config.remotePort}`);
        }
      }
      
      if (config.debug) {
        args.push('-D');
      }
      
      if (config.interface) {
        args.push('-I', config.interface);
      }
      
      try {
        const process = spawn(gostPath, args);
        task.process = process;
        task.status = '运行中';
        task.url = url;
        
        sendLog(id, `重启任务: ${id}`);
        sendLog(id, `启动命令: ${gostPath} ${args.join(' ')}`);
        
        // 恢复 stdout 和 stderr 事件监听器，显示 Gost 进程的运行结果
        // 这些日志会显示在任务的独立日志区域中
        
        process.stdout.on('data', (data) => {
          sendLog(id, data.toString().trim());
        });
        
        process.stderr.on('data', (data) => {
          const message = data.toString().trim();
          // 检查是否为正常日志信息，不是真正的错误
          if (
            message.includes('route.go:700:') && message.includes('on [::]:') ||
            message.includes('[http]') && (message.includes('->') || message.includes('<->')) ||
            message.includes('[route]') && message.includes('->') ||
            message.includes('[tcp]') && (message.includes('->') || message.includes('<->'))
          ) {
            sendLog(id, message);
          } else {
            sendLog(id, `错误: ${message}`);
          }
        });
        
        process.on('close', (code) => {
          sendLog(id, `进程已关闭，退出码: ${code}`);
          task.status = '已停止';
          sendTaskStatus(id, '已停止');
          sendTaskList();
          task.process = null;
        });
        
        sendTaskStatus(id, '运行中');
        sendTaskInfo(id, {
          url: task.url,
          pid: process.pid
        });
        sendLog(id, '任务启动成功');
      } catch (error) {
        sendLog(id, `启动任务失败: ${error.message}`);
        sendTaskStatus(id, '启动失败');
      }
    }
  });
  sendTaskList();
});

ipcMain.on('stop-all-tasks', (event, taskId) => {
  sendLog('系统', '开始停止所有任务');
  tasks.forEach((task, id) => {
    if (task.process) {
      sendLog(id, '停止任务');
      task.process.kill();
      task.status = '已停止';
      sendTaskStatus(id, '已停止');
      sendLog(id, '任务已停止');
    }
  });
  sendTaskList();
  sendLog('系统', '所有任务已停止');
});

app.whenReady().then(() => {
  loadTasks();
  createWindow();

  app.on('activate', function() {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function() {
  saveTasks();
  // 不退出应用程序，让它在任务栏中继续运行
  // if (process.platform !== 'darwin') app.quit();
});
