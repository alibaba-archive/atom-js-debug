'use babel';
import Vue from 'vue';
import debugHelper from '../lib/debug-helper';
import fs from 'fs-extra';
import logger from '../lib/debug-log';

Vue.component('debug-file', {
    template: `
        <li class="list-item" @click.stop="clicknode">
            <span class="icon icon-file-code"></span>{{script.name}}
        </li>
    `,
    props:['script'],
    methods: {
        clicknode: function() {
            let _this = this;
            if (!this.script.relateScript.fetched) {
                debugHelper.getScriptSource(this.script.relateScript.scriptId).then(output => {
                    fs.outputFile(this.script.relateScript.localPath, output, (err) => {
                        if (err) {
                            _this.script.relateScript.fetched = false;
                            logger.error('fetch remote file fail: unable to save file ', err);
                        } else {
                            _this.script.relateScript.fetched = true;
                            atom.workspace.open(this.script.relateScript.localPath, {pending: true});
                        }
                    });
                }).catch(err => {
                    logger.error('Fetching script', err);
                });
            } else {
                atom.workspace.open(this.script.relateScript.localPath, {pending: true});
            }
        }
    }
});
