'use babel';
import Vue from 'vue';
import debugHelper from '../lib/debug-helper';
import {RemoteObjectF, ScopeF} from '../service/debug-interface';
import logger from '../lib/debug-log';

Vue.component('debug-callframepanel', {
    template: `
        <div class="callframe-panel">
            <atom-panel>
                <div class="inset-panel">
                    <div class="panel-heading" :class="{ collapsed: display }"  @click.stop="toggle">
                        CallFrames
                    </div>
                    <div class="panel-content native-key-bindings" v-show="display">
                        <div class="callframeItem panel-body"
                            v-for="(index, callframe) in callframes"
                            :key="callframe.callframeId"
                            :class="{selected : index===selectedCallframe}"
                            v-on:click="select(index)">
                            <span>{{callframe.functionName === '' ? '(Anonymous function)' : callframe.functionName}}</span>
                            <span class="space"></span>
                            <span class="normal-font">{{callframe.scriptName}}</span>
                            <span class="badge badge-small">{{ callframe.location && callframe.location.lineNumber + 1}}</span>
                        </div>
                    </div>
                </div>
            </atom-panel>
        </div>
    `,
    props: ['initialDisplay', 'callframes', 'initialSelectedCallframe'],
    methods: {
        select: async function(index) {
            this.selectedCallframe = index;
            let callFrame = this.callframes[index];
            if (!callFrame) {
                return Promise.resolve();
            }
            let location = callFrame.location;
            let script = debugHelper.getScriptById(location.scriptId);
            if (script) {
                debugHelper.highlight(script.localPath, location.lineNumber, index === 0 ? 'current' : 'frame');
            }

            //this.$emit('this', new RemoteObjectF(callFrame.this, 'this'));
            let scope = callFrame.scopeChain.map(scope => new ScopeF(scope));
            scope[0]._object.open = true;
            debugHelper.setOpenStatus(scope[0]._object, true);
            try {
                this.$dispatch('loadding', true);
                await Promise.all(scope.map(async currentScope => {
                    if (currentScope._object.open) {
                        await currentScope._object.fetchChildren();
                        if (!currentScope._object.children) {
                            return;
                        }
                        callFrame.this.name = 'this';
                        currentScope._object.children.push(new RemoteObjectF(callFrame.this, 'scope'));
                        if (debugHelper.getOpenStatus(currentScope._object.children[currentScope._object.children.length - 1])) {
                            await currentScope._object.children[currentScope._object.children.length - 1].fetchChildren();
                        } else {
                            await currentScope._object.children[currentScope._object.children.length - 1].fetchChildren({isPreview: true});
                        }
                    } else {
                        currentScope._object.fetchChildren({isPreview: true});
                    }
                }));
                this.$dispatch('loadding', false);
                this.$emit('scope', scope);
            } catch(err) {
                logger.error('Select callframe', err);
                this.$dispatch('loadding', false);
            }
        },
        toggle: function() {
            this.display = !this.display;
        }
    },
    data: function() {
        return {
            display: this.initialDisplay,
            selectedCallframe: this.initialSelectedCallframe
        }
    }
});
