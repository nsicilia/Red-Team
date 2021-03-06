'use strict'

const dg = require('../helpers/Debug')(true)

function SocketManager() {
  this.channels = {}
  this.clients = {}
  this.registerChannel('AIs')
  this.registerChannel('Clients')
  this.registerChannel('SFs')
  this.registerChannel('Queued')
  this.registerChannel('Error')
}

SocketManager.prototype.registerChannel = function(name) {
  this.channels[name] = {clients: {}}
}

SocketManager.prototype.channelList = function() {
  return Object.keys(this.channels)
}

SocketManager.prototype.channelClientAmount = function(channel) {
  return Object.keys(this.channels[channel].clients).length
}

SocketManager.prototype.clientAmount = function() {
  return Object.keys(this.clients).length
}

SocketManager.prototype.addClient = function(channel, id, socket) {
  this.clients[id] = {
    socket: socket,
    channel: channel
  }
}

SocketManager.prototype.connectAI = function(initial) {
  if (initial === undefined) {
    this.broadcast('SFs', 'connectAI')
  } else {
    let amountToConnect = 4 - this.channelClientAmount('Clients')
    for (let i = 0; i < amountToConnect; i++) {
      this.broadcast('SFs', 'connectAI')
    }
  }
}

SocketManager.prototype.addToChannel = function(channel, id, socket) {
  if (channel === 'Clients') {
    if (this.channelClientAmount('AIs') > 0) {
      this.broadcast('SFs', 'removeAI')
    }
    if (this.channelClientAmount(channel) === 4) {
      return false
    }
  }

  if (channel === 'AIs') {
    let totalClients = this.channelClientAmount(channel) + this.channelClientAmount('Clients')
    if (totalClients >= 4) {
      return false
    }
  }

  this.channels[channel].clients[id] = socket
  this.addClient(channel, id, socket)
  return true
}

SocketManager.prototype.getClient = function(id) {
  return this.clients[id]
}

SocketManager.prototype.getClientFromChannel = function(channel, id) {
  let c = this.channels[channel]
  let clients = Object.keys(c.clients)

  for (let client of clients) {
    if (id === client) {
      return this.channels[channel].clients[id]
    }
  }

  return false
}

SocketManager.prototype.removeFromChannel = function(channel, id) {
  let c = this.channels[channel]
  let clients = Object.keys(c.clients)

  for (let client of clients) {
    if (id === client) {
      delete c.clients[id]
      delete this.clients[id]

      dg(`id: ${id} -> disconnected from channel: (${channel})`, 'info')

      return true
    }
  }

  return false
}

SocketManager.prototype.broadcast = function(channel, event, data) {
  switch (event) {
    case 'updateState':
    case 'currentlyConnected':
    case 'removeAI':
    case 'connectAI':
    case 'newGame':
      break
    default:
      return false
  }

  let payload = this.generatePayload(event, data)

  let c = this.channels[channel]
  let clients = Object.keys(c.clients)

  clients.forEach((client) => {
    let socket = c.clients[client]
    if (socket.readyState === 1) {
      socket.send(payload)
    }
  })
}

SocketManager.prototype.broadcastAll = function(event, data) {
  switch (event) {
    case 'gameEvent':
    case 'gameOver':
    case 'newGame':
    case 'errorMessage':
      break
    default:
      return false
  }

  let payload = this.generatePayload(event, data)

  Object.keys(this.channels).forEach((channel) => {
    let c = this.channels[channel]
    Object.keys(c.clients).forEach((client) => {
      let socket = c.clients[client]
      if (socket.readyState === 1) {
        socket.send(payload)
      }
    })
  })
}

SocketManager.prototype.emit = function(id, event, data, callback) {
  switch (event) {
    case 'gameEvent':
    case 'dataUpdate':
    case 'errorMessage':
    case 'updateState':
    case 'currentlyConnected':
    case 'invalidPlay':
    case 'playTimer':
      break
    default:
      return false
  }

  let client = this.getClient(id)
  if (client === undefined) {
    return callback()
  }

  let payload = this.generatePayload(event, data)
  let socket = client.socket
  if (socket.readyState === 1) {
    client.socket.send(payload)
  }
}

SocketManager.prototype.generatePayload = function(message, data) {
  let payload = {
    event: message,
    data: data
  }

  return JSON.stringify(payload)
}

module.exports = function() {
  return new SocketManager()
}
