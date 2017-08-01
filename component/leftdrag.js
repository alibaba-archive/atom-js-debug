'use babel';
import Vue from 'vue';
import $ from 'jquery';
import draggable from './draggable';

Vue.component('debug-leftdrag', {
    template: `
        <div class="debug-leftdrag">
        </div>
    `,
    props:['draggable'],
    ready: function() {
        let _this = this;
        this.draggable.draggable = draggable($('.debug-leftdrag'), {
            onmousedown: function () {
                _this.draggable.width = true;
                _this.draggable.widthSplit = $('.debug-panel').width();
                _this.draggable.currentWidth = _this.draggable.widthSplit;
            },

            onmousemove: function (distance) {
                if (!_this.draggable.width) return;
                var val = Math.max(_this.draggable.widthMin, _this.draggable.widthSplit + distance.x);
                _this.draggable.currentWidth = val;
                $('.debug-panel').width(val);
            },

            onmouseup() {
                _this.draggable.width = false;
            },
        });
    }
});
