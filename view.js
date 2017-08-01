'use babel';
import fs from 'fs';
import path from 'path';

export default class VueView {
    constructor() {
        this.element = document.createElement('div');
        this.element.classList.add('vue-test');
        this.element.innerHTML = fs.readFileSync(path.join(__dirname, 'view.html'));
        this.element.__proto__.getTitle = function() {
            return 'Debug Panel';
        };
        this.element.__proto__.getPreferredWidth = () => 350;
    }

    getElement() {
        return this.element;
    }

    destroy() {
        this.element.remove();
    }
}
