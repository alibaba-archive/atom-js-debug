'use babel';
import Vue from 'vue';
import debugHelper from '../lib/debug-helper';

Vue.component('debug-breakpointpanel', {
    template: `
        <div class="breakpoint-panel">
            <atom-panel>
                <div class="inset-panel">
                    <div @click.stop="toggle" class="panel-heading" :class="{ collapsed: display }">
                        Breakpoints
                    </div>
                    <div class="panel-content native-key-bindings" v-show="display">
                        <div class="breakpointItem panel-body">
                            <span><input @click="all" type="checkbox" name="breakpoint" value="all" :checked="pauseOnAllExceptions"></span>
                            <span>Pause on ALL Exceptions</span>
                            <span class="space"></span>
                        </div>
                        <div class="breakpointItem panel-body" :class="{hide: pauseOnAllExceptions}">
                            <span><input @click="uncaught" type="checkbox" name="breakpoint" value="uncaught" :checked="pauseOnUncaughtExceptions"></span>
                            <span>Pause on UNCAUGHT Exceptions</span>
                            <span class="space"></span>
                        </div>
                        <debug-breakpoint v-for="(index, breakpoint) in breakpoints"
                            :breakpoint="breakpoint"
                            :index="index"
                            track-by="$index">
                        </debug-breakpoint>
                    </div>
                </div>
            </atom-panel>
        </div>
    `,
    props: ['initialDisplay', 'initialPauseOnAllExceptions', 'initialPauseOnUncaughtExceptions', 'breakpoints'],
    methods: {
        toggle: function() {
            this.display = !this.display;
        },
        all: function() {
            this.pauseOnAllExceptions = !this.pauseOnAllExceptions;
            this.setPauseMode();
        },
        uncaught: function() {
            this.pauseOnUncaughtExceptions = !this.pauseOnUncaughtExceptions;
            this.setPauseMode();
        },
        setPauseMode: function() {
            if (!debugHelper.isDebugging()) {
                return;
            }
            if (this.pauseOnAllExceptions) {
                debugHelper.setPauseOnExceptions('all');
            } else if (this.pauseOnUncaughtExceptions) {
                debugHelper.setPauseOnExceptions('uncaught');
            } else {
                debugHelper.setPauseOnExceptions('none');
            }
        }
    },
    data: function() {
        return {
            display: this.initialDisplay,
            pauseOnAllExceptions: this.initialPauseOnAllExceptions,
            pauseOnUncaughtExceptions: this.initialPauseOnUncaughtExceptions
        }
    }
});
