'use babel'
import Vue from 'vue';
import debugHelper from '../lib/debug-helper';
import logger from '../lib/debug-log';

Vue.component('debug-watchpanel', {
    template: `
        <div class="watch-panel">
            <atom-panel>
                <div class="inset-panel">
                    <div class="panel-heading" :class="{ collapsed: display }" @click.stop="toggle">
                        Watch
                        <span class='loading loading-spinner-tiny inline-block loading-spinner-mini' :class="loadingClass"></span>
                        <span class="space"></span>
                        <span class="icon icon-file-add panel-button add-watch" @click.stop="addwatch"></span>
                    </div>
                    <div class="panel-content" v-show="display">
                        <div class="watchItem panel-body" v-for="(index, expression) in watchExpressions" :data-index="index" track-by"expression">
                            <ul class='list-tree has-collapsable-children'>
                                <debug-object :object="expression.result">
                                </debug-object>
                            </ul>
                            <span class="icon icon-dash item-button delete-watch" @click.stop="remove(index)"></span>
                        </div>
                        <input v-focus="watchInputBox"
                            v-model="input"
                            @blur.stop.prevent="submit"
                            @keyup.enter.prevent.stop="submit"
                            v-show="watchInputBox" type="text" placeholder="Input expression here" class="input-text native-key-bindings input-watch"/>
                        <debug-mask :loadding="loaddingWatch" :spinner="false">
                        </debug-mask>
                    </div>
                </div>
            </atom-panel>
        </div>
    `,
    props: ['initialDisplay', 'watchExpressions', 'initialWatchInputBox', 'initialLoaddingWatch'],
    methods: {
        submit: function() {
            if (this.input) {
                let _this = this;
                debugHelper.addWatchList(this.input);
                //Fixme: fetch watch result immediately. This is a work around
                debugHelper.evaluateWatchList().catch(err => {
                    logger.warn('evaluate watch list fail', err);
                }).then(() => {
                    _this.$emit('updatewatch');
                });
            }
            this.input = '';
            this.watchInputBox = false;
        },
        addwatch: function() {
            this.watchInputBox = true;
        },
        toggle: function() {
            this.display = !this.display;
        },
        remove: function(index) {
            let _this = this;
            debugHelper.removeWatchList(debugHelper.getWatchList()[index]);
            //FIXME: Implements calculate watch and replace next pause call!
            debugHelper.evaluateWatchList().catch(err => {
                logger.warn('evaluate watch list fail', err);
            }).then(() => {
                _this.$emit('updatewatch');
            });
        },
        loadding: function(isLoading) {
            this.loaddingWatch = isLoading;
        }
    },
    directives: {
        focus: {
            update: function(newValue) {
                let el = this.el;
                if (newValue) {
                    Vue.nextTick(function() {
                        el.focus();
                    });
                }
            }
        }
    },
    data: function() {
        return {
            display: this.initialDisplay,
            input: '',
            watchInputBox: this.initialWatchInputBox,
            loaddingWatch: this.initialLoaddingWatch,
        }
    },
    computed: {
        loadingClass: function() {
            return {
                'loadding-spinner-ok': !this.loaddingWatch
            }
        }
    }
});
