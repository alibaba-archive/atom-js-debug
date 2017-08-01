'use babel';
import {EventEmitter} from 'events';
import EventCode from './lib/eventcode';

class MsgMgr {
    constructor() {
        var _this = this;
        _this.evt = new EventEmitter();
        _this.evt.setMaxListeners(0);
        _this.evt.on('error', err => {
            atom.notifications.addError(err);
        });
    }

    on(evt, listener) {
        this.evt.on(evt, listener);
    }

    off(evt, listener) {
        this.evt.removeListener(evt, listener);
    }

    send(evt, value) {
        this.evt.emit(evt, value);
    }

    dispose() {
    }

}

const instance = new MsgMgr();
export default instance;
