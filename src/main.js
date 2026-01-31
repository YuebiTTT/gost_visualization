function log(data) {
  const timestamp = new Date().toLocaleString();
  const taskId = data.taskId || '系统';
  const message = data.message;
  const isError = message.includes('错误') || message.includes('失败');
  
  // 1. 添加到任务独立日志（如果有taskId）
  if (taskId !== '系统') {
    const taskLogDiv = document.getElementById(`task-log-${taskId}`);
    if (taskLogDiv) {
      const logEntry = document.createElement('div');
      logEntry.className = 'task-log-entry' + (isError ? ' task-log-error' : '');
      logEntry.innerHTML = `[${timestamp}] ${message}`;
      
      taskLogDiv.appendChild(logEntry);
      taskLogDiv.scrollTop = taskLogDiv.scrollHeight;
      
      // 限制任务日志行数
      if (taskLogDiv.children.length > 500) {
        taskLogDiv.removeChild(taskLogDiv.firstChild);
      }
    }
  }
  
  // 2. 添加到总日志区域
  const logDiv = document.getElementById('log');
  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry' + (isError ? ' log-error' : '');
  logEntry.innerHTML = `[${timestamp}] <span class="log-task-id">${taskId.substring(0, 8)}</span>: ${message}`;
  
  logDiv.appendChild(logEntry);
  logDiv.scrollTop = logDiv.scrollHeight;
  
  // 限制总日志行数
  if (logDiv.children.length > 1000) {
    logDiv.removeChild(logDiv.firstChild);
  }
}

function toggleTaskLog(taskId) {
  const taskLogDiv = document.getElementById(`task-log-${taskId}`);
  if (taskLogDiv) {
    if (taskLogDiv.style.display === 'none') {
      taskLogDiv.style.display = 'block';
    } else {
      taskLogDiv.style.display = 'none';
    }
  }
}

function getConfig() {
  return {
    name: document.getElementById('task-name').value,
    localProto: document.getElementById('local-proto').value,
    localPort: document.getElementById('local-port').value,
    remoteProto: document.getElementById('remote-proto').value,
    remoteAddr: document.getElementById('remote-addr').value,
    remotePort: document.getElementById('remote-port').value,
    mode: document.getElementById('mode').value,
    targetAddr: document.getElementById('target-addr').value,
    targetPort: document.getElementById('target-port').value,
    interface: document.getElementById('interface').value,
    debug: document.getElementById('debug').checked
  };
}

function createTask() {
  const config = getConfig();
  electronAPI.createTask(config);
}

function startAllTasks() {
  electronAPI.startAllTasks();
}

function stopAllTasks() {
  electronAPI.stopAllTasks();
}

function renderTaskList(tasks) {
  const taskListDiv = document.getElementById('task-list');
  
  if (tasks.length === 0) {
    taskListDiv.innerHTML = '<div class="empty-state" id="empty-state">暂无任务，点击上方按钮创建新任务</div>';
    return;
  }
  
  taskListDiv.innerHTML = '';
  
  tasks.forEach(task => {
    const taskItem = document.createElement('div');
    taskItem.className = 'task-card';
    taskItem.dataset.taskId = task.id;
    
    let statusClass = 'status-stopped';
    if (task.status === '运行中') {
      statusClass = 'status-running';
    } else if (task.status === '启动失败') {
      statusClass = 'status-failed';
    }
    
    taskItem.innerHTML = `
      <div class="task-header">
        <div class="task-info">
          <div class="task-name">${task.name}</div>
          <div class="task-meta">
            <span>ID: ${task.id.substring(0, 8)}</span>
            <span>URL: ${task.url}</span>
          </div>
        </div>
        <div class="task-status ${statusClass}">${task.status}</div>
      </div>
      <div class="task-details">
        ${task.config.mode === 'portmap' ? `
          <div class="task-detail-item">
            <span class="task-detail-label">模式:</span>
            <span>端口映射</span>
          </div>
          ${task.config.targetAddr ? `
            <div class="task-detail-item">
              <span class="task-detail-label">映射目标:</span>
              <span>${task.config.targetAddr}:${task.config.targetPort}</span>
            </div>
          ` : ''}
        ` : `
          <div class="task-detail-item">
            <span class="task-detail-label">模式:</span>
            <span>代理</span>
          </div>
          ${task.config.remoteProto ? `
            <div class="task-detail-item">
              <span class="task-detail-label">远程地址:</span>
              <span>${task.config.remoteProto}:${task.config.remoteAddr}:${task.config.remotePort}</span>
            </div>
          ` : `
            <div class="task-detail-item">
              <span class="task-detail-label">模式:</span>
              <span>直接代理</span>
            </div>
          `}
        `}
        ${task.config.interface ? `
          <div class="task-detail-item">
            <span class="task-detail-label">网络接口:</span>
            <span>${task.config.interface}</span>
          </div>
        ` : ''}
        ${task.config.debug ? `
          <div class="task-detail-item">
            <span class="task-detail-label">调试模式:</span>
            <span>已启用</span>
          </div>
        ` : ''}
      </div>
      <div class="task-actions">
        ${task.status !== '运行中' ? `<button class="btn btn-primary" onclick="startTask('${task.id}')">启动</button>` : `<button class="btn btn-danger" onclick="stopTask('${task.id}')">停止</button>`}
        <button class="btn btn-info" onclick="removeTask('${task.id}')">删除</button>
      </div>
      <div class="task-log-section">
        <div class="task-log-header">
          <div class="task-log-title">任务日志</div>
          <div class="task-log-toggle" onclick="toggleTaskLog('${task.id}')">显示/隐藏</div>
        </div>
        <div class="task-log" id="task-log-${task.id}"></div>
      </div>
    `;
    
    taskListDiv.appendChild(taskItem);
  });
}

function startTask(taskId) {
  electronAPI.startTask(taskId);
}

function stopTask(taskId) {
  electronAPI.stopTask(taskId);
}

function removeTask(taskId) {
  if (confirm('确定要删除这个任务吗？')) {
    electronAPI.removeTask(taskId);
  }
}

function updateTaskStatus(data) {
  const taskElement = document.querySelector(`.task-card[data-task-id="${data.taskId}"]`);
  if (taskElement) {
    const statusElement = taskElement.querySelector('.task-status');
    statusElement.textContent = data.status;
    
    statusElement.className = 'task-status';
    if (data.status === '运行中') {
      statusElement.classList.add('status-running');
    } else if (data.status === '已停止') {
      statusElement.classList.add('status-stopped');
    } else {
      statusElement.classList.add('status-failed');
    }
    
    // 更新操作按钮
    const actionsElement = taskElement.querySelector('.task-actions');
    if (data.status === '运行中') {
      actionsElement.innerHTML = `
        <button class="btn btn-danger" onclick="stopTask('${data.taskId}')">停止</button>
        <button class="btn btn-info" onclick="removeTask('${data.taskId}')">删除</button>
      `;
    } else {
      actionsElement.innerHTML = `
        <button class="btn btn-primary" onclick="startTask('${data.taskId}')">启动</button>
        <button class="btn btn-info" onclick="removeTask('${data.taskId}')">删除</button>
      `;
    }
  }
}

// 暴露全局函数
window.startTask = startTask;
window.stopTask = stopTask;
window.removeTask = removeTask;
window.toggleTaskLog = toggleTaskLog;

electronAPI.onLog(log);
electronAPI.onTaskStatus(updateTaskStatus);
electronAPI.onTaskList(renderTaskList);

document.getElementById('create-task-btn').addEventListener('click', createTask);
document.getElementById('start-all-btn').addEventListener('click', startAllTasks);
document.getElementById('stop-all-btn').addEventListener('click', stopAllTasks);

// 主题切换功能
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    document.getElementById('theme-toggle').textContent = '切换到浅色模式';
  }
}

function toggleTheme() {
  const body = document.body;
  const themeToggle = document.getElementById('theme-toggle');
  
  if (body.classList.contains('dark-theme')) {
    body.classList.remove('dark-theme');
    themeToggle.textContent = '切换到深色模式';
    localStorage.setItem('theme', 'light');
  } else {
    body.classList.add('dark-theme');
    themeToggle.textContent = '切换到浅色模式';
    localStorage.setItem('theme', 'dark');
  }
}

// 初始化主题
initTheme();

// 绑定主题切换按钮
document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

// 初始化时获取任务列表
electronAPI.getTaskList();

log({ message: 'GOST代理可视化工具已就绪' });
log({ message: '请配置任务参数并点击创建按钮' });
log({ message: '支持同时启动多个代理任务' });


