'use babel';
import Vue from 'vue';
import logger from '../lib/debug-log';
import debugHelper from '../lib/debug-helper';

Vue.component('debug-object', {
    template: `
        <li v-if="['object', 'map', 'set', 'function'].includes(object.type) && object.subtype !== 'null'" class="list-nested-item" :class="{collapsed: !object.open}">
            <div class="list-item nodeItem clickable" :data-object-id="object.objectId" @click.stop='clicknode(object.objectId)'>
                <debug-property
                    :name="object.name"
                    :type="object.type"
                    :preview="object.preview"
                    :description="object.description"
                    :partial-preview="object.partialPreview"
                    :children="object.children"
                    :full-name="object.fullName"
                    :subtype="object.subtype"
                    :value="object.value"
                    @getter="getter"
                    >
                </debug-property>
            </div>
            <ul class="list-tree" v-if="object.open">
                <debug-object v-for="child in object.children"
                    :object="child"
                    @clicknode="clicknode"
                    track-by="$index"
                    >
                </debug-object>
            </ul>
        </li>
        <li v-else class="list-item">
            <debug-property
                :name="object.name"
                :type="object.type"
                :preview="object.preview"
                :description="object.description"
                :value="object.value"
                :full-name="object.fullName"
                :subtype="object.subtype"
                @getter="getter"
                >
            </debug-property>
        </li>
    `,
    props:['object'],
    methods: {
        getter: function(fullName) {
            let _this = this;
            if (this.object.type !== 'getter') {
                return;
            }
            this.$dispatch('loadding', true);
            debugHelper.evaluateOnCallFrame(this.object.fullName).then(res => {
                _this.object.description = res.description;
                _this.object.type = res.type;
                _this.object.value = res.value;
                _this.object.className = res.className;
                _this.object.objectId = res.objectId;
                _this.object.fetchChildren();
                _this.$dispatch('loadding', false);
            }).catch(err => {
                logger.error('Fetching getter', err);
                _this.$dispatch('loadding', false);
            });
            debugHelper.loopProperties(this.object).then(res => {
                console.log(res);
            });
        },
        clicknode: async function(objectId) {
            if (this.object.open) {
                this.object.open = false;
                debugHelper.setOpenStatus(this.object, false);
            } else {
                if (!this.object.children || this.object.children.length <= 0) {
                    this.object.open = true;
                    debugHelper.setOpenStatus(this.object, true);
                }
                if (this.object.type === 'getter') {
                    return;
                }
                try {
                    this.$dispatch('loadding', true);
                    await this.object.fetchChildren();
                    this.object.open = true;
                    debugHelper.setOpenStatus(this.object, true);
                    this.$dispatch('loadding', false);
                } catch(err) {
                    logger.error('Clicking node', err);
                    this.$dispatch('loadding', false);
                }
            }
        }
    }
});
