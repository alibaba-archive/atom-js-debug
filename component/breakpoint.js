'use babel';
import Vue from 'vue';
import debugHelper from '../lib/debug-helper';

Vue.component('debug-breakpoint', {
    template: `
        <div class="breakpointItem panel-body" @click.stop="select">
            <span><input @click.stop="check" type="checkbox" name="breakpoint" :value="index" :checked="breakpoint.isEnabled"/></span>
            <span>{{ breakpoint.name }}</span>
            <span class="space"></span>
            <span class="icon icon-dash item-button delete-breakpoint" @click.stop="remove"></span>
            <span class="badge badge-small">{{ breakpoint.row + 1 }}</span>
        </div>
    `,
    props: ['index', 'breakpoint'],
    methods: {
        select: function() {
            debugHelper.highlight(this.breakpoint.script, this.breakpoint.row, 'goto');
        },
        check: function() {
            this.breakpoint.isEnabled = !this.breakpoint.isEnabled;
            debugHelper.changeBreakpoint(this.breakpoint, this.breakpoint.isEnabled);
        },
        remove: function() {
            debugHelper.onRemoveBreakpoint(this.breakpoint, true);
        }
    }
});
