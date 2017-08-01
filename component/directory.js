'use babel';
import Vue from 'vue';

Vue.component('debug-directory', {
    template: `
        <li class="list-nested-item" :class="{collapsed: !folder.open}">
            <div class="list-item nodeItem" @click.stop="clicknode">
                <span class="icon icon-file-directory"></span>
                {{folder.name}}
            </div>
            <ul class="list-tree">
                <debug-directory v-for="child in folder.children | filterBy 'folder' in 'type'" track-by="$index"
                    :folder="child">
                </debug-directory>
                <debug-file v-for="child in folder.children | filterBy 'file' in 'type'" track-by="$index"
                    :script="child">
                </debug-file>
            </ul>
        </li>
    `,
    props:['folder'],
    methods: {
        clicknode: function() {
            this.folder.open = !this.folder.open;
            if (this.folder.open) {
                let folder = this.folder;
                while (folder.children && folder.children.length === 1) {
                    folder.children[0].open = true;
                    folder = folder.children[0];
                }
            }
        }
    }
});
