'use babel'
import Vue from 'vue';

Vue.component('debug-scopepanel', {
    template: `
        <div class="scope-panel">
            <atom-panel>
                <div class="inset-panel">
                    <div class="panel-heading" :class="{ collapsed: display }" @click.stop="toggle">
                        Scopes
                        <span class='loading loading-spinner-tiny inline-block loading-spinner-mini' :class="loadingClass"></span>
                        <span class="space"></span>
                    </div>
                    <div class="panel-content native-key-bindings" v-show="display">
                        <div class="scopeItem panel-body" v-for="(index, scope) in scopes" :data-index="index">
                            <ul class='list-tree has-collapsable-children'>
                                <debug-object :object="scope.object">
                                </debug-object>
                            </ul>
                        </div>
                        <debug-mask :loadding="loaddingScope" :spinner="false">
                        </debug-mask>
                    </div>
                </div>
            </atom-panel>
        </div>
    `,
    props: ['initialDisplay', 'scopes', 'initialLoaddingScope'],
    methods: {
        toggle: function() {
            this.display = !this.display;
        },
        loadding: function(isLoading) {
            this.loaddingScope = isLoading;
        }
    },
    data: function() {
        return {
            display: this.initialDisplay,
            loaddingScope: this.initialLoaddingScope
        }
    },
    computed: {
        loadingClass: function() {
            return {
                'loadding-spinner-ok': !this.loaddingScope
            }
        }
    }
});
