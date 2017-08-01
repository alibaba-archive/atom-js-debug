'use babel'
import Vue from 'vue';
import logger from '../lib/debug-log';
import debugHelper from '../lib/debug-helper';
import path from 'path';

Vue.component('debug-property', {
    template: `
    <span>
        <template v-if="type =='string'">
            <span class="text-color-info prop-name" v-show="name" data-name="{{ fullName }}">{{ name }} : </span>
            <span @dblclick.stop="copyDesciption" class="prop-description" data-desc="{{ value }}"> "{{ value }}"</span>
        </template>
        <template v-if="['object', 'map', 'set', 'array', 'function'].includes(type) && subtype !== 'null' && subtype !== 'internal#location'">
            <span class="text-color-info prop-name" data-name="{{ fullName }}" v-show="name">{{ name }} : </span>
            <span @dblclick.stop="copyDesciption" class="prop-description" data-desc="{{ description }}"> {{ description }}</span>
            <span class="text-preview" data-prev="{{ displayPreview }}"> {{ displayPreview }}</span>
        </template>
        <template v-if="!['object', 'map', 'set', 'array', 'string', 'function'].includes(type) || subtype === 'null' || subtype === 'internal#location'">
            <span class="text-color-info prop-name" v-show="name" data-name="{{ fullName }}"> {{ name }} : </span>
            <span v-if="type=='getter' && description=='(...)'" class="debug-getter prop-description" @click.stop="getter" data-desc="{{ description }}"> {{ description }}</span>
            <span v-else @dblclick.stop="copyDesciption" class="prop-description" data-desc="{{ text }}"> {{ text }} </span>
        </template>
    </span>
    `,
    props: ['name', 'type', 'description', 'preview', 'partialPreview', 'children', 'fullName', 'value', 'subtype'],
    computed: {
        displayPreview: function() {
            return this.preview;
        },
        text: function() {
            if (this.subtype === 'internal#location') {
                // display fix for internal#locations like function["[[FunctionLocaltion]]"]
                // TODO: click to jump to target position
                try {
                    return path.basename(debugHelper.getScriptById(this.value.scriptId).virtualPath) + '#' + (this.value.lineNumber + 1);
                } catch(err) {
                    console.log(err);
                }
            }
            let ret = typeof this.description !== 'undefined' ? this.description: typeof this.value !== 'undefined' ? this.value : typeof this.subtype !== 'undefined' ? this.subtype : this.type
            if (ret === null) {
                ret = 'null';
            }
            return ret;
        }
    },
    compiled: function() {
        if (this.name === 'domain') {
            console.log(this);
        }
    },
    methods: {
        getter: function() {
            this.$emit('getter');
        },
        copyDesciption: function() {
            logger.info('copy description', this.description);
            atom.clipboard.write(this.description);
        }
    }
});
