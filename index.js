let PlexAPI = require('plex-api');
var Service, Characteristic;

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-plex", "Plex", Plex);
}

function Plex(log, config) {
    this.log = log;
    this.name = config["name"];
    this.plexUsername = config["plex_username"];
    this.plexPassword = config["plex_password"];
    this.host = config["host"] || 'localhost';
    this.port = config["port"] || '32400';
    this.filter = config["filter"] || [];
    this.pollingInterval = config["polling_interval"] || 3;
    this.debug = config["debug"] || false;
    this.service = new Service.OccupancySensor(this.name);
    this.playing = false;

    this.client = new PlexAPI({
        hostname: this.host,
        port: this.port,
        username: this.plexUsername,
        password: this.plexPassword,
    });

    this.service
        .getCharacteristic(Characteristic.OccupancyDetected)
        .on('get', this.getState.bind(this));

    var self = this;

    var callback = function (err, value) {
        setTimeout(function () {
            self.getState(callback);
        }, self.pollingInterval * 1000);

        if (err !== null)
            return;

        self.service
            .getCharacteristic(Characteristic.OccupancyDetected)
            .updateValue(value);
    };

    self.getState(callback);
}

Plex.prototype.getState = function (callback) {
  if (this.debug) {
    this.log('Getting current state...');
  }

  this.client
    .query('/status/sessions')
    .then(
      (result) => {
        const data = result.MediaContainer;
        let playing = false;

        if (data.size === 0) {
          if (this.debug) {
            this.log('No active sessions on your server. Plex is not playing.');
          }

          callback(null, false);
          return;
        }

        if (!this.debug) {
        } else if (data.size === 1) {
          this.log('There is one active session:');
        } else {
          this.log(`There are ${data.size} active sessions:`);
        }

        data.Video
          .forEach((e) => {
            const player = e.Player.title;
            const user = e.User.title;
            const state = e.Player.state;

            let rulesMatch = true;
            const stateMatch = state === 'playing';

            if (stateMatch && player) {
              rulesMatch = false;

              this.filter
                .forEach((rule) => {
                  if (this.debug) {
                    this.log(`'${rule.player}' vs '${player}'`);
                    this.log(`'${rule.user}' vs '${user}'`);
                  }
                  const playerMatch = !rule.player || rule.player.toLowerCase().indexOf(player.toLowerCase()) > -1;
                  const userMatch = !rule.user || rule.user.toLowerCase().indexOf(user.toLowerCase()) > -1;
                  rulesMatch = rulesMatch || playerMatch && userMatch;
                });
            }

            if (this.debug) {
              this.log(`→ ${user} [${player}]: ${state}${rulesMatch ? '' : ' (ignored)'}`);
            }

            playing = playing || stateMatch && rulesMatch;

            if (this.debug || this.playing !== playing) {
              this.log(`Plex is ${(playing ? '' : 'not ')}playing.`);
            }
          });

        this.playing = playing;
        callback(null, playing);
      },
      (err) => {
        this.log('Could not connect to server', err);
      }
    );
};

Plex.prototype.getServices = function () {
    return [this.service];
}
