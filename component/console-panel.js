'use babel';
import Vue from 'vue';
import debugHelper from '../lib/debug-helper';
import {RemoteObjectF} from '../service/debug-interface';
import logger from '../lib/debug-log';

Vue.component('debug-consolepanel', {
    template: `
        <div class="console-panel">
            <atom-panel>
                <div class="inset-panel">
                    <div class="panel-heading" :class="{ collapsed: display }" @click.stop="toggle">
                        Console
                        <span class='loading loading-spinner-tiny inline-block loading-spinner-mini' :class="loadingClass"></span>
                        <span class="space"></span>
                    </div>
                    <div class="panel-content native-key-bindings" v-show="display">
                        <div class="consoleItem" v-for="(index, console) in consoles" track-by="$index">
                            <div v-if="typeof console === 'string'">
                                {{console}}
                            </div>
                            <ul v-else class='list-tree has-collapsable-children'>
                                <debug-object :object="console">
                                </debug-object>
                            </ul>
                        </div>
                        <input v-model="input"
                            @keyup.enter.stop="submit"
                            type="text"
                            placeholder="Input expression here"
                            class="input-text input-console"/>
                        <debug-mask :loadding="loaddingConsole" :spinner="false">
                        </debug-mask>
                    </div>
                </div>
            </atom-panel>
        </div>
    `,
    props: ['initialDisplay', 'initialConsoles', 'callframe0', 'initialLoaddingConsole'],
    methods: {
        submit: function() {
            let _this = this;
            this.consoles.push('> ' + this.input);
            debugHelper.evaluateOnCallFrame(this.input, this.callframe0).then(res => {
                let resObject = new RemoteObjectF(res, 'console');
                resObject.fetchChildren({isPreview: true}).then(() => {
                    _this.consoles.push(resObject);
                });
            }).catch(err => {
                logger.error('Evaluating console', err);
            });
            this.input = '';
        },
        toggle: function() {
            this.display = !this.display;
        },
        loadding: function(isLoading) {
            this.loaddingConsole = isLoading;
        },
        message: function(message) {
            // current we don't care other infomation in message
            console.log('add message', message);
            this.consoles.push(message.text);
        },
        clean: function() {
            this.consoles = [];
        }
    },
    data: function() {
        return {
            display: this.initialDisplay,
            input: '',
            consoles: this.initialConsoles,
            loaddingConsole: this.initialLoaddingConsole
        }
    },
    computed: {
        loadingClass: function() {
            return {
                'loadding-spinner-ok': !this.loaddingConsole
            }
        }
    }
});
