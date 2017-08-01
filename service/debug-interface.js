'use babel';
/**
 * Created by yugi on 2017/2/17.
 */
import {RemoteObject, Scope, Expression, Script} from '../lib/debug-interface';
import logger from '../lib/debug-log';
import debugHelper from '../lib/debug-helper';

class RemoteObjectF extends RemoteObject {
    constructor(remoteObject, belong) {
        super(remoteObject);
        this.belong = belong;
        !this.fullName && (this.fullName = this.name);
        //this.open = false;
        this.open = debugHelper.getOpenStatus(this);
        this.partialPreview = remoteObject.partialPreview || false;
        remoteObject.children && (this.children = remoteObject.children.map(child => new RemoteObjectF(child, belong)));
    }

    get partialPreview() {
        return this._partialPreview;
    }

    set partialPreview(partialPreview) {
        this._partialPreview = partialPreview;
    }

    get preview() {
        //logger.info('Calculating preview', this.fullName, this);
        let expand = '';
        if (this.children && this.children.length > 0) {
            //logger.info('classname of ', this, 'is', this.className);
            if (this.type === 'map') {
                return '';
                // TODO: MAP PREVIEW
                // return '{ ' + (this.children.filter(res => res.name === '[[Entries]]')[0]|| []).children.map(res => res.name + ':' + res.description).join(' ') + ' }';
            } else if (this.type === 'set') {
                return '';
                // TODO: SET PREVIEW
                // return '{ ' + (this.children.filter(res => res.name === '[[Entries]]')[0] || []).children.map(res => res.name + ':' + res.description).join(' ') + ' }';
            } else if (['Array', 'ArrayBuffer', 'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array', 'Int32Array', 'TypedArray', 'Uint8ClampedArray', 'Float32Array', 'Float64Array'].includes(this.className)) {
                let size = this.description.match(/.*\[(\d*)\]/);
                if ((this.partialPreview || (this.children && this.children.length > 3)) && size && parseInt(size[1]) > 3) {
                    expand = ', ...';
                }
                return '[' + this.children.filter(res => !res.name.startsWith('__')).filter(ele => ele.name !== 'length').map(res => res.name + ':' + res.description).filter((ele, index) => index < 3).join(', ') + expand + ']';
            } else {
                if (this.partialPreview || (this.children && this.children.length > 3)) {
                    expand = ', ...';
                }
                return '{' + this.children.filter(res => !res.name.startsWith('__')).map(res => res.name + ':' + res.description).filter((ele, index) => index < 3).join(', ') + expand + '}';
            }
        } else {
            return '{}';
        }
    }

    async fetchChildren(options = {}) {
        if (!atom.config.get('atom-js-debug.ObjectPreview') && options.isPreview) {
            return Promise.resolve();
        }
        let _this = this;
        if (!['object', 'set', 'map', 'function'].includes(this.type)) {
            return Promise.resolve();
        }

        if (!debugHelper.isDebugging()) {
            return;
        }
        let res = await debugHelper.loopProperties(_this, options);
        if (!res || !res.children) {
            console.warn('Fetch children fail', _this, options);
            _this.children = [];
            return;
        }

        _this.children = res.children
            .map(remoteObject =>  new RemoteObjectF(remoteObject, _this.belong))
            .sort((a,b) => {return a.name && a.name.localeCompare && b.name ? a.name.localeCompare(b.name) : 0});

        await Promise.all(_this.children
            .filter(remoteObject =>
                remoteObject.open
            )
            .map(remoteObject => remoteObject.fetchChildren()));

        if (!options || !options.isPreview) {
            await Promise.all(_this.children
                .filter(remoteObject =>
                    !remoteObject.open
                )
                .map(remoteObject => remoteObject.fetchChildren({isPreview: true})));
        }

        //_this.checkGetter();
    }

    checkGetter() {
        if (!this.children) {
            return;
        }
        let proto = this.children.filter(child => child.name === '__proto__');
        if (proto && proto[0] && proto[0].children) {
           let getter = proto[0].children.filter(child => child.type === 'getter');
           getter.forEach(ele => {
               if (this.children.filter(child => child.name === ele.name).length === 0) {
                   if (ele.fullName.match(new RegExp("(.*)\\[\\'__proto__\\'\\]\\[\\'" + ele.name + "\\'\\]"))) {
                       ele.fullName = ele.fullName.replace(/\[\'__proto__\'\]/g, '');
                   } else {
                       logger.warn('Fail to resolve getter fullName', ele);
                   }
                   //ele.fullName = ele.fullName.replace(new RegExp("(.*)\.__proto__\." + ele.name), `$1['${ele.name}']`);
                   ele.description = '(...)';
                   this.children.push(ele);
               }
           });
        }
        if (this.className && this.className.includes('Error')) {
            let stack = this.children.filter(child => child.name === 'stack');
            if (stack && stack[0]) {
                stack[0].description = '(...)';
            }
            // It's not good but we guess it's a getter
        }
    }

    findByObjectId(objectId, fn) {
        if (this.objectId === objectId) {
            return fn(this);
        } else {
            (this.children || []).forEach(child => {
                child.findByObjectId(objectId, fn);
            });
        }
    }

    findByFullName(fullName, fn) {
        if (this.fullName === fullName) {
            return fn(this);
        } else {
            (this.children || []).forEach(child => {
                child.findByObjectId(fullName, fn);
            });
        }
    }
}

class ScopeF extends Scope {
    constructor(scope) {
        super(scope.type, scope.object, scope.name);
        this._object = new RemoteObjectF(this._object, 'scope')
        this._object._name = scope.type;
    }
}

class ExpressionF extends Expression {
    constructor(expression) {
        super(expression.expression);
        if (expression._result) {
            this._result = new RemoteObjectF(expression._result, 'watch');
            if (!this._result.name) {
                this._result.name = expression.expression;
            }
        } else {
            this._result = {name: expression.expression, fullName: expression.expression};
        }
    }
}

class FileF extends Script {
    constructor(Script) {
        super(Script.scriptId, Script.remotePath, Script.localPath);
    }

    show() {
        atom.workspace.open(this.localPath, {});
    }

}

module.exports = {ScopeF, ExpressionF, RemoteObjectF, FileF};
