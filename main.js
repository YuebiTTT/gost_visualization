const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let tasks = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL('http://localhost:5173/');

  mainWindow.on('closed', function() {
    tasks.forEach((task, id) => {
      if (task.process) {
        task.process.kill();
      }
    });
    if (process.platform !== 'darwin') app.quit();
  });
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
  createWindow();

  app.on('activate', function() {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function() {
  tasks.forEach((task, id) => {
    if (task.process) {
      task.process.kill();
    }
  });
  if (process.platform !== 'darwin') app.quit();
});
