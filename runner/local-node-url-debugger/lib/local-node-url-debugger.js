'use babel';
let LocalJsInspectDebugger;
import {exec} from 'child_process';
import { CompositeDisposable } from 'atom';
import _ from 'underscore';

export default (LocalJsInspectDebugger = {
    subscriptions: null,
    activated: false,

    activate(state) {
        console.log('activate runner');
        // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
        this.subscriptions = new CompositeDisposable;

        // Register command that toggles this view
        return this.subscriptions.add(atom.commands.add('atom-workspace', {'local-node-url-debugger:toggle': () => this.toggle()}));
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
            runnerName: 'local node url debugger',
            debugForum: {
                template:
                    `<div class="local-node-url-debugger native-key-bindings">
                        <div>
                            <span>Debug URL</span><input type="text" class='input-text' v-model="debugUrl" Placeholder="Enter url from node-inspector or node --inspect">
                        </div>
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
                        let res = this.debugUrl.match(/ws=(.*)/) || this.debugUrl.match(/ws:\/\/(.*)/);
                        debugService.debug(res && res[1] ? 'http://' + res[1] : this.debugUrl, {
                            eventHandler: {
                            }
                        });
                    }
                },
                data: function() {
                    return {
                        debugUrl: ''
                    }
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
