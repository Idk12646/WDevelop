/*
 *  WDevelop — Global State
 *  -----------------------
 *  Everything the engine needs to share between files
 *  lives here, inside one namespace. Yeah, it's basically
 *  a singleton, but we don't have modules (no server = no ES imports),
 *  so this is the cleanest way to do it.
 */

var App = {

    // scene objects — the main array AND a fast lookup hash.
    // always keep both in sync when adding/removing stuff.
    objects: [],
    objectMap: {},   // { id -> object } for O(1) access in the render loop

    events: [],
    extensions: [],

    selectedObjectId: null,
    isPlaying: false,

    // counters that survive save/load
    nextObjectId: 0,
    nextEventId: 0,

    // these get assigned once the engine boots up
    scene: null,
    engine: null,
    canvas: null,
    gizmoManager: null,
    editorCamera: null,
    renderPipeline: null,
    shadowGenerator: null,

    // currently pressed keys (updated by the keyboard observer)
    keys: {},

    currentTool: 'move',

    // modal popup state (for adding conditions/actions)
    modal: {
        isOpen: false,
        eventId: null,
        listType: null,
        itemIndex: -1,
        tempData: null
    }
};


/*
 *  Extension API
 *  -------------
 *  Third-party scripts call WDevelop.registerAction/Condition
 *  to inject custom logic blocks into the event system.
 */
window.WDevelop = {
    actions: {},
    conditions: {},

    registerAction: function (id, label, icon, hasTarget, hasTarget2, hasValue, codeStr) {
        this.actions[id] = { label: label, icon: icon, hasTarget: hasTarget, hasTarget2: hasTarget2, hasValue: hasValue, codeStr: codeStr };
    },

    registerCondition: function (id, label, icon, hasTarget, hasTarget2, hasValue, codeStr) {
        this.conditions[id] = { label: label, icon: icon, hasTarget: hasTarget, hasTarget2: hasTarget2, hasValue: hasValue, codeStr: codeStr };
    }
};


/*
 *  Helper: find object by id.
 *  Uses the hash when possible (hot path), falls back to linear search.
 */
function findObject(id) {
    return App.objectMap[id] || null;
}

/*
 *  Helper: register a new object into both the array and the hash.
 */
function registerObject(obj) {
    App.objects.push(obj);
    App.objectMap[obj.id] = obj;
}

/*
 *  Helper: remove object from both stores.
 */
function unregisterObject(id) {
    App.objects = App.objects.filter(function (o) { return o.id !== id; });
    delete App.objectMap[id];
}

/*
 *  Helper: grab an object's display name (used all over the events UI).
 */
function getObjectName(id) {
    var obj = findObject(id);
    return obj ? obj.name : '???';
}
