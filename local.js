// Generated by CoffeeScript 1.6.2
(function() {
  var Encryptor, KEY, METHOD, PORT, REMOTE_PORT, SERVER, config, configContent, configFromArgs, connections, createServer, fs, inet, inetAton, inetNtoa, k, net, path, timeout, utils, v;

  net = require("net");

  fs = require("fs");

  path = require("path");

  utils = require('./utils');

  inet = require('./inet');

  Encryptor = require("./encrypt").Encryptor;

  inetNtoa = function(buf) {
    return buf[0] + "." + buf[1] + "." + buf[2] + "." + buf[3];
  };

  inetAton = function(ipStr) {
    var buf, i, parts;

    parts = ipStr.split(".");
    if (parts.length !== 4) {
      return null;
    } else {
      buf = new Buffer(4);
      i = 0;
      while (i < 4) {
        buf[i] = +parts[i];
        i++;
      }
      return buf;
    }
  };

  createServer = function(serverAddr, serverPort, port, key, method, timeout) {
    var getServer, server;

    getServer = function() {
      if (serverAddr instanceof Array) {
        return serverAddr[Math.floor(Math.random() * serverAddr.length)];
      } else {
        return serverAddr;
      }
    };
    server = net.createServer(function(connection) {
      var addrLen, addrToSend, cachedPieces, clean, encryptor, headerLength, remote, remoteAddr, remotePort, stage;

      connections += 1;
      encryptor = new Encryptor(key, method);
      stage = 0;
      headerLength = 0;
      remote = null;
      cachedPieces = [];
      addrLen = 0;
      remoteAddr = null;
      remotePort = null;
      addrToSend = "";
      utils.debug("connections: " + connections);
      clean = function() {
        utils.debug("clean");
        connections -= 1;
        remote = null;
        connection = null;
        return encryptor = null;
      };
      connection.on("data", function(data) {
        var aServer, addrtype, buf, cmd, e, reply, tempBuf;

        utils.log(utils.EVERYTHING, "connection on data");
        if (stage === 5) {
          data = encryptor.encrypt(data);
          if (!remote.write(data)) {
            connection.pause();
          }
          return;
        }
        if (stage === 0) {
          tempBuf = new Buffer(2);
          tempBuf.write("\u0005\u0000", 0);
          connection.write(tempBuf);
          stage = 1;
          return;
        }
        if (stage === 1) {
          try {
            cmd = data[1];
            addrtype = data[3];
            if (cmd !== 1) {
              utils.error("unsupported cmd: " + cmd);
              reply = new Buffer("\u0005\u0007\u0000\u0001", "binary");
              connection.end(reply);
              return;
            }
            if (addrtype === 3) {
              addrLen = data[4];
            } else if (addrtype !== 1 && addrtype !== 4) {
              utils.error("unsupported addrtype: " + addrtype);
              connection.destroy();
              return;
            }
            addrToSend = data.slice(3, 4).toString("binary");
            if (addrtype === 1) {
              remoteAddr = inetNtoa(data.slice(4, 8));
              addrToSend += data.slice(4, 10).toString("binary");
              remotePort = data.readUInt16BE(8);
              headerLength = 10;
            } else if (addrtype === 4) {
              remoteAddr = inet.inet_ntop(data.slice(4, 20));
              addrToSend += data.slice(4, 22).toString("binary");
              remotePort = data.readUInt16BE(20);
              headerLength = 22;
            } else {
              remoteAddr = data.slice(5, 5 + addrLen).toString("binary");
              addrToSend += data.slice(4, 5 + addrLen + 2).toString("binary");
              remotePort = data.readUInt16BE(5 + addrLen);
              headerLength = 5 + addrLen + 2;
            }
            buf = new Buffer(10);
            buf.write("\u0005\u0000\u0000\u0001", 0, 4, "binary");
            buf.write("\u0000\u0000\u0000\u0000", 4, 4, "binary");
            buf.writeInt16BE(2222, 8);
            connection.write(buf);
            aServer = getServer();
            remote = net.connect(serverPort, aServer, function() {
              var addrToSendBuf, i, piece;

              utils.info("connecting " + remoteAddr + ":" + remotePort);
              if (!encryptor) {
                if (remote) {
                  remote.destroy();
                }
                return;
              }
              addrToSendBuf = new Buffer(addrToSend, "binary");
              addrToSendBuf = encryptor.encrypt(addrToSendBuf);
              remote.write(addrToSendBuf);
              i = 0;
              while (i < cachedPieces.length) {
                piece = cachedPieces[i];
                piece = encryptor.encrypt(piece);
                remote.write(piece);
                i++;
              }
              cachedPieces = null;
              return stage = 5;
            });
            remote.on("data", function(data) {
              var e;

              utils.log(utils.EVERYTHING, "remote on data");
              try {
                data = encryptor.decrypt(data);
                if (!connection.write(data)) {
                  return remote.pause();
                }
              } catch (_error) {
                e = _error;
                utils.error(e);
                if (remote) {
                  remote.destroy();
                }
                if (connection) {
                  return connection.destroy();
                }
              }
            });
            remote.on("end", function() {
              utils.debug("remote on end");
              if (connection) {
                return connection.end();
              }
            });
            remote.on("error", function(e) {
              utils.debug("remote on error");
              return utils.error("remote " + remoteAddr + ":" + remotePort + " error: " + e);
            });
            remote.on("close", function(had_error) {
              utils.debug("remote on close:" + had_error);
              if (had_error) {
                if (connection) {
                  return connection.destroy();
                }
              } else {
                if (connection) {
                  return connection.end();
                }
              }
            });
            remote.on("drain", function() {
              utils.debug("remote on drain");
              return connection.resume();
            });
            remote.setTimeout(timeout, function() {
              utils.debug("remote on timeout");
              remote.destroy();
              return connection.destroy();
            });
            if (data.length > headerLength) {
              buf = new Buffer(data.length - headerLength);
              data.copy(buf, 0, headerLength);
              cachedPieces.push(buf);
              buf = null;
            }
            return stage = 4;
          } catch (_error) {
            e = _error;
            utils.error(e);
            if (connection) {
              connection.destroy();
            }
            if (remote) {
              return remote.destroy();
            }
          }
        } else {
          if (stage === 4) {
            return cachedPieces.push(data);
          }
        }
      });
      connection.on("end", function() {
        utils.debug("connection on end");
        if (remote) {
          return remote.end();
        }
      });
      connection.on("error", function(e) {
        utils.debug("connection on error");
        return utils.error("local error: " + e);
      });
      connection.on("close", function(had_error) {
        utils.debug("connection on close:" + had_error);
        if (had_error) {
          if (remote) {
            remote.destroy();
          }
        } else {
          if (remote) {
            remote.end();
          }
        }
        return clean();
      });
      connection.on("drain", function() {
        utils.debug("connection on drain");
        if (remote && stage === 5) {
          return remote.resume();
        }
      });
      return connection.setTimeout(timeout, function() {
        utils.debug("connection on timeout");
        if (remote) {
          remote.destroy();
        }
        if (connection) {
          return connection.destroy();
        }
      });
    });
    server.listen(port, function() {
      return utils.info("server listening at port " + port);
    });
    server.on("error", function(e) {
      if (e.code === "EADDRINUSE") {
        return utils.error("Address in use, aborting");
      }
    });
    return server;
  };

  if (require.main === module) {
    console.log(utils.version);
    configContent = fs.readFileSync(path.resolve(__dirname, "config.json"));
    config = JSON.parse(configContent);
    configFromArgs = utils.parseArgs();
    for (k in configFromArgs) {
      v = configFromArgs[k];
      config[k] = v;
    }
    if (config.verbose) {
      utils.config(utils.DEBUG);
    }
    SERVER = config.server;
    REMOTE_PORT = config.server_port;
    PORT = config.local_port;
    KEY = config.password;
    METHOD = config.method;
    timeout = Math.floor(config.timeout * 1000);
    connections = 0;
    createServer(SERVER, REMOTE_PORT, PORT, KEY, METHOD, timeout);
  } else {
    exports.createServer = createServer;
  }

}).call(this);
