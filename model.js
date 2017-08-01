'use babel';
export default class VueModel {
    constructor() {
        this.watchExpressions = [];
        this.callframes = [];
        this.breakpoints = [];
        this.consoles = [];
        this.scopes = [];//TODO: TO CALCULATE
        this.selectedCallframe = 0;
        this.watchInputBox = false;
        this.running = false;
        this.pauseOnAllExceptions = false;
        this.pauseOnUncaughtExceptions = true;
        this.pauseData = {};
        this.displayScope = true;
        this.displayWatch = true;
        this.displayCallframe = true;
        this.displayBreakpoint = true;
        this.displayConsole = true;
        this.displayFile = true;
        this.scriptTree = {};
        this.loadding = false;
        this.loaddingScope = false;
        this.loaddingWatch = false;
        this.loaddingConsole = false;
        this.draggable = {width: false, widthSplit:0, currentWidth:350, widthMin: 300}
        this.thisObject = {};//TODO: TO CALCULATE
        this.debugging = false;
        this.runnerList = [];
    }
}
