'use babel';
import Vue from 'vue';

Vue.component('debug-entry', {
    template: `
        <div class="debug-entry" v-show="display">
            <div class="entry-select">
                <span>Runner:</span>
                <select v-model="selectRunner">
                    <option v-for="runner in runnerList" :value="runner" >{{runner.runnerName}}</option>
                </select>
            </div>
            <component :is="selectRunner.runnerName">
            </component>        
       </div>
    `,
    props:["runnerList", "display"],
    methods: {
        refresh: async function() {
        }
    },
    watch: {
        selectRunner(val) {
           // console.log(val);
        },
        runnerList(val) {
           // console.log(val);
        }
    },
    compiled: async function() {
    }
});
