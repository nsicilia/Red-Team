'use strict'

const dg = require('../helpers/Debug')(true)
const PlayerManager = require('./PlayerManager')
const GameManager = require('./GameManager')
const FrontendManager = require('./FrontendManager')

let firstTurnSet = false

module.exports = (webSocket) => {
  class ServerManager {
    constructor() {
      this.frontends = []
      this.currentlyConnected = 0
      this.gameManager = new GameManager(null)
      this.players = new Array(4).fill(null)
      this.oldPlayerData = new Array(4).fill(null)
      this.queue = []
      this.listenForClients()
    }

    /**
     * Listens to socket events that happen
     */
    listenForClients() {
      webSocket.on('connection', socket => {
        socket.on('message', response => {
          let r = JSON.parse(response)
          switch (r.event) {
            case 'whoAmI':
              this.determineClientType(r.data.client, socket)
              break
            default:
              socket.send('hmmmm, wrong message.')
          }
        })

        socket.on('close', z => {
          this.removeFromQueue(socket._socket.remoteAddress)
        })
      })
    }

    determineClientType(client, socket) {
      switch (client) {
        case 'SF':
          this.createFrontend(socket)
          break
        case 'AI':
          this.createManager(socket, true)
          break
        case 'CL':
          this.createManager(socket, false)
          break
        case 'Q':
          this.addToQueue(socket)
          break
      }
    }

    // TODO: Check is user is playing already @Landon

    /**
     * Creates a player manager for a connected player
     * @param {String} name - name of the player
     * @param {String} team - player team
     * @param {Boolean} ai - is ai
     * @param {Object} socket - socket object
     */
    createManager(socket, isAI) {
      for (let i = 0; i < this.players.length; i++) {
        let p = this.players[i]
        if (p === null) {
          let player = new PlayerManager(i, socket, isAI, this.clientDisconnect.bind(this), this.gameManager.determineEvent)
          if (this.oldPlayerData[i] !== null) {
            this.injectOldData(i, player)
          }
          if (!isAI) {
            this.currentlyConnected++
            this.emitCurrentlyConnected()
          }
          if (!firstTurnSet) {
            player.isTurn = true
            firstTurnSet = true
          }
          player.retrieveDBInfo()
          this.players.splice(i, 1, player)
          return
        }
      }
      // change to error message
      this.emitErrorMessage(socket, 'too many players connected')
    }

    /**
     * Removes the diconnected client and saves their data
     * @param {String} name - name
     * @param {Number} position - position
     * @param {Object} oldData - client old data
     */
    clientDisconnect(name, position, oldData) {
      dg(`${name} disconnected`, 'debug')
      let isAI = false
      this.currentlyConnected--
      this.addOldData(position, oldData)
      if (this.players[position].isAI) {
        isAI = true
      }
      this.players.splice(position, 1, null)
      if (!isAI) {
        this.emitCurrentlyConnected()
        this.addAI(position)
      }
    }

    /**
     * Asks frontend to add AI at position
     * @param {Number} position - position
     */
    addAI(position) {
      for (let frontend of this.frontends) {
        frontend.addAI(position)
      }
    }

    /**
     * Asks frontend to remove AI at position
     * @param {Number} position - position
     */
    removeAI(position) {
      for (let frontend of this.frontends) {
        frontend.removeAI(position)
      }
    }

    /**
       * Creates only one frontend manager instance
       */
    createFrontend(socket) {
      let manager = new FrontendManager(socket, this.frontends.length, this.frontendDisconnect.bind(this))
      this.frontends.push(manager)
    }

    /**
     * Removes the disconnected front end
     * @param {Number} number - number
     */
    frontendDisconnect(number) {
      this.frontends.splice(number, 1)
      dg(`frontend ${number} disconnected`, 'debug')
    }

    /**
     * Injects old data from a past connected player into a new player manager
     * @param {Number} pos - position of the player
     * @param {PlayerManager} p - manager
     */
    injectOldData(pos, p) {
      let old = this.oldPlayerData[pos]
      p.addPositionDetails(old.tiles, old.isTurn)
      this.oldPlayerData.splice(pos, 1, null)
    }

    addOldData(pos, p) {
      this.oldPlayerData.splice(pos, 1, {
        tiles: p.tiles,
        isTurn: p.isTurn,
        score: p.score
      })
    }

    addToQueue(socket) {
      let ip = socket._socket.remoteAddress
      this.queue.push({ip: ip, socket: socket})
    }

    removeFromQueue(ip) {
      for (let i = 0; i < this.queue.length; i++) {
        let queued = this.queue[i]
        if (queued.ip === ip) {
          this.queue.splice(i, 1)
          return
        }
      }
    }

    emitCurrentlyConnected() {
      let cc = {
        event: 'currentPlayerCount',
        data: {
          amount: this.currentlyConnected
        }
      }
      for (let queued of this.queue) {
        queued.socket.send(JSON.stringify(cc))
      }
    }

    /**
     * Emits error message to specified player
     * @param {Object} socket - socket
     * @param {String} message - message
     */
    emitErrorMessage(socket, message) {
      let error = {
        type: 'errorMessage',
        data: {
          error: message
        }
      }
      socket.send(JSON.stringify(error))
    }
  }

  return ServerManager
}