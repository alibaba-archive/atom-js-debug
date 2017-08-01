'use babel';
import Vue from 'vue';

Vue.component('debug-mask', {
    template: `
        <div class="mask" v-bind:style="{display: loadding ? 'block' : 'none'}">
            <div>&nbsp;</div>
            <span class='loading loading-spinner-small inline-block' v-if="spinner"></span>
        </div>
    `,
    props: ['loadding', 'spinner']
});
