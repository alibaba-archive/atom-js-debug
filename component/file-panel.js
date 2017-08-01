'use babel';
import Vue from 'vue';

Vue.component('debug-filepanel', {
    template: `
        <div class="file-panel">
            <atom-panel>
                <div class="inset-panel">
                    <div class="panel-heading" :class="{ collapsed: display }"  @click.stop="toggle">
                        Remote Files
                    </div>
                    <div class="panel-content native-key-bindings" v-show="display">
                        <div class="fileItem" v-if="scriptTree.children">
                            <ul class='list-tree has-collapsable-children'>
                                <debug-directory :folder="scriptTree">
                                </debug-directory>
                            </ul>
                        </div>
                    </div>
                </div>
            </atom-panel>
        </div>
    `,
    props: ['initialDisplay', 'scriptTree'],
    methods: {
        toggle: function() {
            this.display = !this.display;
        }
    },
    data: function() {
        return {
            display: this.initialDisplay
        }
    }
});
