'use babel';
const Name2Level = {
    'debug':1,
    'info':2,
    'warn':3,
    'error':4
}
// const usagecode = require('../../component/usagecode');
// var timeTable = {};
const debugLog = {
    timestamp: function() {
        let date = new Date();
        return date.toLocaleString() + '.' + date.getMilliseconds();
    },
    setLevel: function(name) {
        console.log('logger level set to:', name);
        this.level = Name2Level[name.toLowerCase()];
    },
    debug: function(...arg) {
        if (this.level > Name2Level['debug']) {
            return;
        }
        arg.unshift('%c [DEBUG] ' + this.timestamp(), 'color: grey');
        console.log.apply(this, arg);
    },
    error: function(...arg) {
        if (this.level > Name2Level['error']) {
            return;
        }
        atom.notifications.addError(arg.join(' '));
        arg.unshift('%c [ERROR] ' + this.timestamp(), 'color: red');
        console.error.apply(this, arg);
    },
    info: function(...arg) {
        if (this.level > Name2Level['info']) {
            return;
        }
        arg.unshift('%c [INFO] ' + this.timestamp(), 'color: blue');
        console.info.apply(this, arg);
    },
    warn: function(...arg) {
        if (this.level > Name2Level['warn']) {
            return;
        }
        arg.unshift('%c [WARN] ' + this.timestamp(), 'color: orange');
        console.warn.apply(this, arg);
    }
};
if (typeof debugLog.level === 'undefined') {
    if (atom.inDevMode()) {
        debugLog.setLevel('debug');
    } else {
        debugLog.setLevel('warn');
    }
}
export default debugLog;
