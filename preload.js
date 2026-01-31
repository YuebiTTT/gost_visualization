const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  createTask: (config) => ipcRenderer.send('create-task', config),
  startTask: (taskId) => ipcRenderer.send('start-task', taskId),
  stopTask: (taskId) => ipcRenderer.send('stop-task', taskId),
  removeTask: (taskId) => ipcRenderer.send('remove-task', taskId),
  getTaskList: () => ipcRenderer.send('get-task-list'),
  startAllTasks: () => ipcRenderer.send('start-all-tasks'),
  stopAllTasks: () => ipcRenderer.send('stop-all-tasks'),
  onLog: (callback) => ipcRenderer.on('log', (event, data) => callback(data)),
  onTaskStatus: (callback) => ipcRenderer.on('task-status', (event, data) => callback(data)),
  onTaskInfo: (callback) => ipcRenderer.on('task-info', (event, data) => callback(data)),
  onTaskList: (callback) => ipcRenderer.on('task-list', (event, data) => callback(data))
});
