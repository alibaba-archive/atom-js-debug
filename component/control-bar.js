'use babel';
import Vue from 'vue';
import debugHelper from '../lib/debug-helper';
import entry from './entry';

Vue.component('debug-controlbar', {
    template: `
        <div class="control-bar" x-show="debugging">
           <div class='btn-group tools'>
               <span @click.stop="resume" class="btn btn-resume debug-tool" title="resume(F8)" v-bind:style="{display: running ? 'none' : 'inline-block'}">
               </span>
               <span @click.stop="pause" class="btn btn-pause debug-tool" title="pause(F8)" v-bind:style="{display: running ? 'inline-block' : 'none'}">
               </span>
               <span @click.stop="stepover" class="btn btn-step-over debug-tool" title="step over(F10)">
               </span>
               <span @click.stop="stepinto" class="btn btn-step-into debug-tool" title="step into(F11)">
               </span>
               <span @click.stop="stepout" class="btn btn-step-out debug-tool" title="step out(shift+F11)">
               </span>
               <span @click.stop="stop" class="btn btn-stop debug-tool" title="stop">
               </span>
               <span @click.stop="config" class="btn btn-config debug-tool icon icon-settings" title="config">
               </span>
           </div>
           <debug-entry :display="configing" :runner-list="runnerList">
           </debug-entry>
       </div>
    `,
    props:['running', 'debugging', 'runnerList'],
    events: {
        debug: function(options) {
            this.configing = false;
            return true;
        }
    },
    methods: {
        resume: function() {
            debugHelper.isDebugging() && debugHelper.resume();
        },
        pause: function() {
            debugHelper.isDebugging() && debugHelper.pause();
        },
        stepout: function() {
            debugHelper.isDebugging() && debugHelper.stepOut();
        },
        stepover: function() {
            debugHelper.isDebugging() && debugHelper.stepOver();
        },
        stepinto: function() {
            debugHelper.isDebugging() && debugHelper.stepInto();
        },
        stop: function() {
            debugHelper.isDebugging() && debugHelper.close();
        },
        config: function() {
            this.configing = !this.configing;
        }
    },
    data: function() {
        return {
            configing: true
        }
    }
});
