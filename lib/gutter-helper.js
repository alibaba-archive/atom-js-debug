'use babel';
import debugHelper from './debug-helper';
export default {
    /**
     * get all breakpoint fits spectify conditions
     * @param  {Object} [options]
     * @param  {String} [options.script]   filter script localPath
     * @param  {Number} [options.row]  filter line number
     * @param  {Boolean} [options.isEnabled]  filter status
     * @return {Array.<PendingBreakpoint>}  All breakpoints satisfy options.
     * @example gutterHelper.filterBreakpoints({script: '/path/to/current/script.js'});
     */
    filterBreakpoints: function(options = {}) {
        return debugHelper.getBreakpoints().filter(bp => (!options.script || options.script === bp.script) &&
            (!options.hasOwnProperty('row') || options.row === bp.row) &&
            (!options.hasOwnProperty('isEnabled') || options.isEnabled === bp.isEnabled));
    },

    isDebugging: function() {
        return debugHelper.isDebugging();
    }
}
