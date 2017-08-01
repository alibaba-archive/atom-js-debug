'use babel';
let LocalJsInspectDebugger;
import {exec} from 'child_process';
import { CompositeDisposable } from 'atom';
import semver from 'semver';
import _ from 'underscore';

export default (LocalJsInspectDebugger = {
    subscriptions: null,
    activated: false,

    activate(state) {
        console.log('activate runner');
        // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
        this.subscriptions = new CompositeDisposable;

        // Register command that toggles this view
        return this.subscriptions.add(atom.commands.add('atom-workspace', {'local-node-inspect-debugger:toggle': () => this.toggle()}));
    },

    deactivate() {
        this.subscriptions.dispose();
    },

    atomDebugService(debugService) {
      console.log('creating interface');
        if (!debugService || !debugService.createInterface || !debugService.debug || !debugService.destroyInterface) {
            throw "not found compatible js debugger";
        }
        debugService.createInterface({
            runnerName: 'local node inspect debugger',
            debugForum: {
                template:
                    `<div class="local-node-inspect-debugger native-key-bindings">
                        <div>
                            <span>Node Cmd</span><input type="text" class='input-text' v-model="nodeCmd"><span>{{nodeVersion}}</span>
                        </div>
                        <div>
                            <span>JS File</span><input type="text" class='input-text' placeholder="your js file to spawn" v-model="jsPath">
                        </div>
                        <!-- Break on first line sometimes not work -->
                        <!--<div>-->
                            <!--<span>break on the first line</span><input type="checkbox" v-model="inspectBrk">-->
                        <!--</div>-->
                        <div>
                            <button class="btn btn-sm" @click.stop="submit">Debug</button>
                        </div>
                    </div>`,
                watch: {
                    nodeCmd: function(newVal) {
                        this.updateNodeVersion();
                    }
                },
                methods: {
                    submit: function() {
                        try {
                            semver.gte(this.nodeVersion, '6.3.0');
                        } catch(err) {
                            console.log(err);
                            throw '--inspect only support node version >=6.3.0. use node inspector or update node instead';
                        }
                        let child = exec(`${this.nodeCmd} ${this.inspectBrk ? semver.gte(this.nodeVersion, '8.0.0') ? "--inspect-brk" : "--inspect --debug-brk" : "--inspect"} ${this.jsPath}`);
                        let output = '';
                        child.stdout.on('data', data => {
                            console.log(data.toString());
                        });
                        child.stderr.on('data', data => {
                            output += data;
                            console.log(output);
                            if (output.includes('address already in use')) {
                                output = '';
                                atom.notifications.addError('Target file already debugging');
                                return;
                            }
                            let res = output.match(/ws=(.*)/) || output.match(/ws:\/\/(.*)/);
                            if (res && res[1]) {
                                output = '';
                                child.stderr.removeAllListeners('data');
                                debugService.debug('http://' + res[1], {
                                    eventHandler: {
                                        postClose: function() {
                                            console.log('shut down child process');
                                            if (process.platform === 'win32') {
                                                exec(`taskkill /F /T /PID ${child.pid}`);
                                            } else {
                                                child.kill('SIGINT');
                                            }
                                        }
                                    }
                                });
                            }
                        });
                    },
                    updateNodeVersion: _.debounce(function() {
                        console.log(this);
                        const _this = this;
                        let nodePath = this.nodeCmd.split(/\s/)[0];
                        console.log(nodePath);
                        exec(`${nodePath} -v`, (err, stdout, stderr) => {
                            console.log(err, stdout.toString(), stderr.toString());
                            if (err || stderr) {
                                _this.nodeVersion = 'Invalid';
                            } else {
                                _this.nodeVersion = stdout.toString().trim();
                            }
                        });
                    }, 300)
                },
                data: function() {
                    return {
                        nodeCmd: 'node',
                        jsPath: '',
                        nodeVersion: ''
                    }
                },
                compiled: function() {
                    this.updateNodeVersion();
                }
            }
        });
    },

    toggle() {
        if (this.activated) {
            return;
        }

        this.activated = true;
    }
});
