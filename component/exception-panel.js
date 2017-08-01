'use babel';
import Vue from 'vue';

Vue.component('debug-exceptionpanel', {
    template: `
        <div class="exceptionsItem native-key-bindings" v-if="pauseData && pauseData.className && pauseData.description">
            <span class='text-color-error'> {{ pauseData.className }}</span>
            <span>:</span>
            <span>{{ pauseData.description }}</span>
        </div>
    `,
    props: ['pauseData']
});
