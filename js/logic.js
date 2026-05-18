/*
 *  WDevelop — Event System & Visual Scripting Engine
 *  ------------------------------------------------
 *  This file handles the visual logic blocks, modal block configuration,
 *  and the runtime execution loop (play/stop state).
 * 
 *  Instead of sluggish linear lookups, we utilize O(1) hashmap lookups
 *  for 3D objects, which keeps our 60 FPS update loop incredibly fast.
 */

// ---- Event Block Administration ----

dom.btnAddEvent.addEventListener('click', function () {
    App.nextEventId++;
    App.events.push({
        id: 'evt_' + App.nextEventId,
        conditions: [],
        actions: []
    });
    renderEvents();
});

function renderEvents() {
    dom.eventsList.innerHTML = '';

    if (App.events.length === 0) {
        dom.eventsList.innerHTML = '<div class="empty-state">No events yet. Click "Add Event Block" to start visually coding.</div>';
        return;
    }

    // High-performance render mappings for visual blocks
    var condRenderers = {
        always: function () { 
            return '<i class="fa-solid fa-infinity"></i> Every Frame'; 
        },
        start: function () { 
            return '<i class="fa-solid fa-flag-checkered"></i> On Start'; 
        },
        pointerdown: function (cond) { 
            return '<i class="fa-solid fa-mouse-pointer"></i> On Click ' + getObjectName(cond.targetId); 
        },
        keydown: function (cond) { 
            return '<i class="fa-regular fa-keyboard"></i> Key Pressed: \'' + cond.key + '\''; 
        },
        keyup: function (cond) { 
            return '<i class="fa-regular fa-keyboard"></i> Key Released: \'' + cond.key + '\''; 
        },
        collide: function (cond) { 
            return '<i class="fa-solid fa-burst"></i> ' + getObjectName(cond.targetId) + ' Collides w/ ' + getObjectName(cond.targetId2); 
        },
        pos_x_gt: function (cond) { 
            return '<i class="fa-solid fa-ruler"></i> ' + getObjectName(cond.targetId) + ' X > ' + cond.speed; 
        },
        pos_x_lt: function (cond) { 
            return '<i class="fa-solid fa-ruler"></i> ' + getObjectName(cond.targetId) + ' X < ' + cond.speed; 
        },
        pos_y_gt: function (cond) { 
            return '<i class="fa-solid fa-ruler"></i> ' + getObjectName(cond.targetId) + ' Y > ' + cond.speed; 
        },
        pos_y_lt: function (cond) { 
            return '<i class="fa-solid fa-ruler"></i> ' + getObjectName(cond.targetId) + ' Y < ' + cond.speed; 
        }
    };

    var actRenderers = {
        hide: function (act) { 
            return '<i class="fa-regular fa-eye-slash"></i> Hide ' + getObjectName(act.targetId); 
        },
        show: function (act) { 
            return '<i class="fa-regular fa-eye"></i> Show ' + getObjectName(act.targetId); 
        },
        destroy: function (act) { 
            return '<i class="fa-solid fa-trash"></i> Destroy ' + getObjectName(act.targetId); 
        },
        look_at: function (act) { 
            return '<i class="fa-solid fa-eye"></i> ' + getObjectName(act.targetId) + ' Look At ' + getObjectName(act.targetId2); 
        },
        set_camera: function (act) { 
            return '<i class="fa-solid fa-video"></i> Look through ' + getObjectName(act.targetId); 
        },
        lock_mouse: function () { 
            return '<i class="fa-solid fa-lock"></i> Lock Mouse (FPS Mode)'; 
        },
        custom_js: function () { 
            return '<i class="fa-brands fa-js"></i> Custom JS Code'; 
        },
        move_fps: function (act) { 
            return '<i class="fa-solid fa-person-running"></i> FPS Move WASD ' + getObjectName(act.targetId); 
        },
        jump: function (act) { 
            return '<i class="fa-solid fa-arrow-up"></i> FPS Gravity & Jump ' + getObjectName(act.targetId); 
        },
        sync_rotation: function (act) { 
            return '<i class="fa-solid fa-clone"></i> ' + getObjectName(act.targetId) + ' Copy Rotation ' + getObjectName(act.targetId2); 
        },
        set_parent: function (act) { 
            return '<i class="fa-solid fa-link"></i> ' + getObjectName(act.targetId) + ' Parent To ' + getObjectName(act.targetId2); 
        }
    };

    App.events.forEach(function (eventBlock) {
        var container = document.createElement('div');
        container.className = 'gd-event';

        // -- Conditions Column --
        var condColumn = document.createElement('div');
        condColumn.className = 'gd-conditions';
        
        eventBlock.conditions.forEach(function (cond, idx) {
            var text = condRenderers[cond.type] ? condRenderers[cond.type](cond) : '';
            
            // Check for user-defined conditions from imported extensions
            if (window.WDevelop.conditions[cond.type]) {
                var ext = window.WDevelop.conditions[cond.type];
                text = '<i class="fa-solid ' + ext.icon + '"></i> ' + ext.label + ' ' + (cond.targetId ? getObjectName(cond.targetId) : '');
            }

            var item = document.createElement('div');
            item.className = 'gd-item';
            item.innerHTML = '<span>' + text + '</span> <i class="fa-solid fa-pen" style="font-size:10px; opacity:0.5;"></i>';
            item.addEventListener('click', function () { 
                openModal(eventBlock.id, 'conditions', idx); 
            });
            condColumn.appendChild(item);
        });

        var btnAddCond = document.createElement('button');
        btnAddCond.className = 'gd-add-btn';
        btnAddCond.innerHTML = '<i class="fa-solid fa-plus"></i> Add Condition';
        btnAddCond.addEventListener('click', function () { 
            openModal(eventBlock.id, 'conditions', -1); 
        });
        condColumn.appendChild(btnAddCond);

        // -- Actions Column --
        var actColumn = document.createElement('div');
        actColumn.className = 'gd-actions';
        
        eventBlock.actions.forEach(function (act, idx) {
            var text = actRenderers[act.type] ? actRenderers[act.type](act) : '';
            
            // Handle parametric movement action names
            if (act.type.indexOf('move_') === 0 && act.type !== 'move_fps') {
                text = '<i class="fa-solid fa-arrow-right"></i> Move ' + act.type.split('_')[1].toUpperCase() + ' ' + getObjectName(act.targetId) + ' (' + act.speed + ')';
            }
            if (act.type.indexOf('set_pos_') === 0) {
                text = '<i class="fa-solid fa-crosshairs"></i> Set ' + act.type.split('_')[2].toUpperCase() + ' ' + getObjectName(act.targetId) + ' to ' + act.speed;
            }
            if (act.type.indexOf('rotate_') === 0) {
                text = '<i class="fa-solid fa-rotate"></i> Rotate ' + act.type.split('_')[1].toUpperCase() + ' ' + getObjectName(act.targetId) + ' (' + act.speed + ')';
            }
            if (act.type.indexOf('scale_') === 0) {
                text = '<i class="fa-solid fa-expand"></i> Scale ' + act.type.split('_')[1] + ' ' + getObjectName(act.targetId) + ' (' + act.speed + ')';
            }
            
            // Check for user-defined actions from imported extensions
            if (window.WDevelop.actions[act.type]) {
                var ext = window.WDevelop.actions[act.type];
                text = '<i class="fa-solid ' + ext.icon + '"></i> ' + ext.label + ' ' + (act.targetId ? getObjectName(act.targetId) : '');
            }

            var item = document.createElement('div');
            item.className = 'gd-item';
            item.innerHTML = '<span>' + text + '</span> <i class="fa-solid fa-pen" style="font-size:10px; opacity:0.5;"></i>';
            item.addEventListener('click', function () { 
                openModal(eventBlock.id, 'actions', idx); 
            });
            actColumn.appendChild(item);
        });

        var btnAddAct = document.createElement('button');
        btnAddAct.className = 'gd-add-btn';
        btnAddAct.innerHTML = '<i class="fa-solid fa-plus"></i> Add Action';
        btnAddAct.addEventListener('click', function () { 
            openModal(eventBlock.id, 'actions', -1); 
        });
        actColumn.appendChild(btnAddAct);

        // -- Event Block Controls (Delete button) --
        var deleteBtn = document.createElement('div');
        deleteBtn.className = 'gd-event-header';
        deleteBtn.title = 'Delete Event Block';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        deleteBtn.addEventListener('click', function () { 
            deleteEvent(eventBlock.id); 
        });

        container.appendChild(condColumn);
        container.appendChild(actColumn);
        container.appendChild(deleteBtn);
        dom.eventsList.appendChild(container);
    });
}

function deleteEvent(id) {
    App.events = App.events.filter(function (e) { return e.id !== id; });
    renderEvents();
}

window.deleteEvent = deleteEvent;


// ---- Modal Block Configuration Editor ----

function openModal(eventId, listType, itemIndex) {
    App.modal.isOpen = true;
    App.modal.eventId = eventId;
    App.modal.listType = listType;
    App.modal.itemIndex = itemIndex;
    App.modal.tempData = null;

    if (itemIndex > -1) {
        var eventBlock = App.events.filter(function (e) { return e.id === eventId; })[0];
        App.modal.tempData = JSON.parse(JSON.stringify(eventBlock[listType][itemIndex]));
    } else {
        App.modal.tempData = { 
            type: (listType === 'conditions' ? 'always' : 'move_x'), 
            targetId: '', 
            targetId2: '', 
            speed: 1, 
            key: 'w', 
            jsCode: 'console.log("Visual Scripting Engine running custom JS!");' 
        };
    }

    document.getElementById('logic-modal').style.display = 'flex';
    document.getElementById('modal-title').innerText = (itemIndex === -1 ? 'Add ' : 'Edit ') + listType.substring(0, listType.length - 1);
    document.getElementById('modal-footer').style.display = 'none';

    renderModalMenu();
}

window.openModal = openModal;

function closeModal() {
    document.getElementById('logic-modal').style.display = 'none';
    App.modal.isOpen = false;
}

window.closeModal = closeModal;

function renderModalMenu() {
    var state = App.modal;

    var conditionItems = [
        { id: 'always',      label: 'Every Frame (Always)' },
        { id: 'start',       label: 'On Start (Once)' },
        { id: 'pointerdown', label: 'On Click Object' },
        { id: 'keydown',     label: 'On Key Pressed' },
        { id: 'keyup',       label: 'On Key Released' },
        { id: 'collide',     label: 'Object Intersects Object' },
        { id: 'pos_x_gt',    label: 'Position X > Value' },
        { id: 'pos_x_lt',    label: 'Position X < Value' },
        { id: 'pos_y_gt',    label: 'Position Y > Value' },
        { id: 'pos_y_lt',    label: 'Position Y < Value' }
    ];

    var actionItems = [
        { id: 'move_x',         label: 'Move X' },
        { id: 'move_y',         label: 'Move Y' },
        { id: 'move_z',         label: 'Move Z' },
        { id: 'set_pos_x',      label: 'Set Position X' },
        { id: 'set_pos_y',      label: 'Set Position Y' },
        { id: 'set_pos_z',      label: 'Set Position Z' },
        { id: 'rotate_x',       label: 'Rotate X' },
        { id: 'rotate_y',       label: 'Rotate Y' },
        { id: 'rotate_z',       label: 'Rotate Z' },
        { id: 'scale_up',       label: 'Scale Up' },
        { id: 'scale_down',     label: 'Scale Down' },
        { id: 'look_at',        label: 'Look At Object' },
        { id: 'hide',           label: 'Hide Object' },
        { id: 'show',           label: 'Show Object' },
        { id: 'destroy',        label: 'Destroy Object' },
        { id: 'set_camera',     label: 'Set Active Camera' },
        { id: 'lock_mouse',     label: 'Lock Mouse (Pointer)' },
        { id: 'move_fps',       label: 'FPS Movement (WASD)' },
        { id: 'jump',           label: 'FPS Gravity & Jump (Space)' },
        { id: 'sync_rotation',  label: 'Copy Rotation From' },
        { id: 'set_parent',     label: 'Set Parent To' },
        { id: 'custom_js',      label: 'Execute Custom JS' }
    ];

    if (state.itemIndex > -1) {
        selectModalType(state.tempData.type);
        return;
    }

    var body = document.getElementById('modal-body');
    body.innerHTML = '';

    var items = (state.listType === 'conditions' ? conditionItems : actionItems);
    items.forEach(function (entry) {
        var el = document.createElement('div');
        el.className = 'menu-item';
        el.textContent = entry.label;
        el.addEventListener('click', function () { 
            selectModalType(entry.id); 
        });
        body.appendChild(el);
    });

    // extension items registered via API
    var registry = (state.listType === 'conditions' ? window.WDevelop.conditions : window.WDevelop.actions);
    Object.keys(registry).forEach(function (id) {
        var el = document.createElement('div');
        el.className = 'menu-item';
        el.style.color = '#0fa';
        el.textContent = registry[id].label + ' (Ext)';
        el.addEventListener('click', function () { 
            selectModalType(id); 
        });
        body.appendChild(el);
    });
}

function selectModalType(type) {
    App.modal.tempData.type = type;
    document.getElementById('modal-footer').style.display = 'block';

    var objectOptions = App.objects.map(function (o) {
        return '<option value="' + o.id + '"' + (App.modal.tempData.targetId === o.id ? ' selected' : '') + '>' + o.name + '</option>';
    }).join('');

    var objectOptions2 = App.objects.map(function (o) {
        return '<option value="' + o.id + '"' + (App.modal.tempData.targetId2 === o.id ? ' selected' : '') + '>' + o.name + '</option>';
    }).join('');

    var html = '<h4>Configure ' + type + '</h4><div style="margin-top:15px;">';

    if (type === 'pointerdown') {
        html += '<label>Object to Click</label><select id="mod-target" class="menu-item" style="width:100%"><option value="">Select Object...</option>' + objectOptions + '</select>';
    } else if (type === 'keydown' || type === 'keyup') {
        var k = App.modal.tempData.key;
        html += '<label>Key</label><select id="mod-key" class="menu-item" style="width:100%">' +
            '<option value="w"' + (k === 'w' ? ' selected' : '') + '>W</option>' +
            '<option value="a"' + (k === 'a' ? ' selected' : '') + '>A</option>' +
            '<option value="s"' + (k === 's' ? ' selected' : '') + '>S</option>' +
            '<option value="d"' + (k === 'd' ? ' selected' : '') + '>D</option>' +
            '<option value=" "' + (k === ' ' ? ' selected' : '') + '>Space</option>' +
        '</select>';
    } else if (type === 'collide') {
        html += '<label>Object 1</label><select id="mod-target" class="menu-item" style="width:100%"><option value="">Select Object...</option>' + objectOptions + '</select>';
        html += '<label style="margin-top:10px;display:block;">Collides with Object 2</label><select id="mod-target2" class="menu-item" style="width:100%"><option value="">Select Object...</option>' + objectOptions2 + '</select>';
    } else if (type === 'look_at' || type === 'sync_rotation' || type === 'set_parent') {
        html += '<label>Object</label><select id="mod-target" class="menu-item" style="width:100%"><option value="">Select Object...</option>' + objectOptions + '</select>';
        html += '<label style="margin-top:10px;display:block;">Target 2</label><select id="mod-target2" class="menu-item" style="width:100%"><option value="">Select Object...</option>' + objectOptions2 + '</select>';
    } else if (['pos_x_gt', 'pos_x_lt', 'pos_y_gt', 'pos_y_lt'].indexOf(type) !== -1) {
        html += '<label>Target Object</label><select id="mod-target" class="menu-item" style="width:100%"><option value="">Select Object...</option>' + objectOptions + '</select>';
        html += '<label style="margin-top:10px;display:block;">Value</label><input type="number" id="mod-speed" step="0.1" value="' + App.modal.tempData.speed + '" class="menu-item" style="width:100%">';
    } else if (['move_x', 'move_y', 'move_z', 'set_pos_x', 'set_pos_y', 'set_pos_z', 'rotate_x', 'rotate_y', 'rotate_z', 'scale_up', 'scale_down', 'hide', 'show', 'destroy', 'set_camera', 'move_fps', 'jump'].indexOf(type) !== -1) {
        html += '<label>Target Object</label><select id="mod-target" class="menu-item" style="width:100%"><option value="">Select Object...</option>' + objectOptions + '</select>';
        if (['hide', 'show', 'destroy', 'set_camera'].indexOf(type) === -1) {
            html += '<label style="margin-top:10px;display:block;">Speed / Value</label><input type="number" id="mod-speed" step="0.1" value="' + App.modal.tempData.speed + '" class="menu-item" style="width:100%">';
        }
    } else if (type === 'lock_mouse') {
        html += '<p style="color:var(--text-muted);">Locks the mouse cursor to the game window. Press ESC to unlock.</p>';
    } else if (type === 'custom_js') {
        html += '<label>JavaScript Code</label>' +
        '<textarea id="mod-js" class="menu-item" style="width:100%; height:120px; font-family:monospace; background:#111; color:#0f0; border:1px solid #333;">' + (App.modal.tempData.jsCode || '') + '</textarea>' +
        '<p style="font-size:0.8rem; color:var(--text-muted); margin-top:5px;">Available vars: <code>scene</code>, <code>objects</code>.</p>';
    } else if (window.WDevelop.actions[type] || window.WDevelop.conditions[type]) {
        var ext = window.WDevelop.actions[type] || window.WDevelop.conditions[type];
        if (ext.hasTarget) html += '<label>Target Object</label><select id="mod-target" class="menu-item" style="width:100%"><option value="">Select Object...</option>' + objectOptions + '</select>';
        if (ext.hasTarget2) html += '<label style="margin-top:10px;display:block;">Target 2</label><select id="mod-target2" class="menu-item" style="width:100%"><option value="">Select Object...</option>' + objectOptions2 + '</select>';
        if (ext.hasValue) html += '<label style="margin-top:10px;display:block;">Value</label><input type="number" id="mod-speed" step="0.1" value="' + App.modal.tempData.speed + '" class="menu-item" style="width:100%">';
    } else {
        html += '<p style="color:var(--text-muted);">No configuration needed.</p>';
    }

    html += '</div>';

    if (App.modal.itemIndex > -1) {
        html += '<button onclick="deleteLogicItem()" class="btn-stop" style="margin-top:20px; width:100%; justify-content:center;"><i class="fa-solid fa-trash"></i> Remove Item</button>';
    }

    document.getElementById('modal-body').innerHTML = html;
}

window.selectModalType = selectModalType;

function saveLogicItem() {
    var targetEl = document.getElementById('mod-target');
    var target2El = document.getElementById('mod-target2');
    var speedEl = document.getElementById('mod-speed');
    var keyEl = document.getElementById('mod-key');
    var jsEl = document.getElementById('mod-js');

    if (targetEl) App.modal.tempData.targetId = targetEl.value;
    if (target2El) App.modal.tempData.targetId2 = target2El.value;
    if (speedEl) App.modal.tempData.speed = parseFloat(speedEl.value);
    if (keyEl) App.modal.tempData.key = keyEl.value;
    if (jsEl) App.modal.tempData.jsCode = jsEl.value;

    var eventBlock = App.events.filter(function (e) { return e.id === App.modal.eventId; })[0];
    if (App.modal.itemIndex === -1) {
        eventBlock[App.modal.listType].push(App.modal.tempData);
    } else {
        eventBlock[App.modal.listType][App.modal.itemIndex] = App.modal.tempData;
    }

    closeModal();
    renderEvents();
}

window.saveLogicItem = saveLogicItem;

function deleteLogicItem() {
    var eventBlock = App.events.filter(function (e) { return e.id === App.modal.eventId; })[0];
    eventBlock[App.modal.listType].splice(App.modal.itemIndex, 1);
    closeModal();
    renderEvents();
}

window.deleteLogicItem = deleteLogicItem;


// ---- Engine Runtime & Core Logic Loop ----

var logicObserver = null;
var activeKeysPrev = {};

dom.btnPlay.addEventListener('click', function () {
    if (App.isPlaying) return;
    App.isPlaying = true;

    dom.btnPlay.style.display = 'none';
    dom.btnStop.style.display = 'flex';

    switchTab('scene');

    App.gizmoManager.attachToMesh(null);
    App.objects.forEach(function (obj) {
        if (obj.mesh) obj.mesh.showBoundingBox = false;
    });

    // Capture initial states so we can completely restore them on Stop
    App.objects.forEach(function (obj) {
        if (obj.mesh) {
            obj.originalState = {
                position: obj.mesh.position.clone(),
                rotation: obj.mesh.rotation.clone(),
                scaling: obj.mesh.scaling.clone(),
                isVisible: obj.mesh.isVisible
            };
            // Hide camera editor gizmos when playing
            if (obj.type === 'camera') obj.mesh.isVisible = false;
        }
    });

    // Run On-Start events immediately
    App.events.forEach(function (eventBlock) {
        var hasStart = eventBlock.conditions.some(function (c) { return c.type === 'start'; });
        if (hasStart) {
            eventBlock.actions.forEach(function (act) { 
                executeAction(act, 1); 
            });
        }
    });

    // Register active 60 FPS visual scripting update loop
    logicObserver = App.scene.onBeforeRenderObservable.add(function () {
        var delta = App.engine.getDeltaTime() / 1000;

        App.events.forEach(function (eventBlock) {
            var conditions = eventBlock.conditions;
            if (conditions.length === 0) {
                eventBlock.actions.forEach(function (act) { executeAction(act, delta); });
                return;
            }

            var met = true;
            conditions.forEach(function (cond) {
                if (cond.type === 'start' || cond.type === 'pointerdown') {
                    // Triggered elsewhere, skip in the hot frame loop
                    return;
                }

                if (cond.type === 'keydown' && !App.keys[cond.key]) {
                    met = false;
                }
                if (cond.type === 'keyup' && !(activeKeysPrev[cond.key] && !App.keys[cond.key])) {
                    met = false;
                }

                if (['collide', 'pos_x_gt', 'pos_x_lt', 'pos_y_gt', 'pos_y_lt'].indexOf(cond.type) !== -1) {
                    var targetObj = findObject(cond.targetId);
                    var m1 = targetObj ? targetObj.mesh : null;
                    if (!m1) { met = false; return; }

                    if (cond.type === 'collide') {
                        var targetObj2 = findObject(cond.targetId2);
                        var m2 = targetObj2 ? targetObj2.mesh : null;
                        if (!m2 || !m1.intersectsMesh(m2, false)) met = false;
                    }
                    if (cond.type === 'pos_x_gt' && !(m1.position.x > cond.speed)) met = false;
                    if (cond.type === 'pos_x_lt' && !(m1.position.x < cond.speed)) met = false;
                    if (cond.type === 'pos_y_gt' && !(m1.position.y > cond.speed)) met = false;
                    if (cond.type === 'pos_y_lt' && !(m1.position.y < cond.speed)) met = false;
                }

                // Extension Registered Condition Evaluator
                if (window.WDevelop.conditions[cond.type]) {
                    var ext = window.WDevelop.conditions[cond.type];
                    try {
                        var targetObj1 = findObject(cond.targetId);
                        var targetObj2 = findObject(cond.targetId2);
                        var m1 = targetObj1 ? targetObj1.mesh : null;
                        var m2 = targetObj2 ? targetObj2.mesh : null;
                        var fn = new Function('mesh', 'mesh2', 'value', 'activeKeys', ext.codeStr);
                        if (!fn(m1, m2, cond.speed, App.keys)) met = false;
                    } catch (e) {
                        console.error('Ext Condition Error:', e);
                        met = false;
                    }
                }
            });

            if (met && conditions.some(function (c) { return c.type !== 'start' && c.type !== 'pointerdown'; })) {
                eventBlock.actions.forEach(function (act) { 
                    executeAction(act, delta); 
                });
            }
        });

        // Store current keys snapshot to track key releases (keyup) in the next tick
        activeKeysPrev = {};
        Object.keys(App.keys).forEach(function (key) {
            activeKeysPrev[key] = App.keys[key];
        });
    });
});

// Click Interaction Handler (Raycasting)
App.scene.onPointerDown = function (evt, pickResult) {
    if (App.isPlaying && pickResult.hit && pickResult.pickedMesh) {
        // Walk up to find root model mesh
        var hitMesh = pickResult.pickedMesh;
        while (hitMesh.parent && hitMesh.parent.name !== '__root__') {
            hitMesh = hitMesh.parent;
        }

        var clickedObj = null;
        for (var i = 0; i < App.objects.length; i++) {
            var obj = App.objects[i];
            if (obj.mesh === pickResult.pickedMesh || obj.mesh === hitMesh || 
               (obj.mesh.getChildren && obj.mesh.getChildren().indexOf(pickResult.pickedMesh) !== -1)) {
                clickedObj = obj;
                break;
            }
        }

        if (clickedObj) {
            App.events.forEach(function (eventBlock) {
                var clickMatches = eventBlock.conditions.some(function (c) { 
                    return c.type === 'pointerdown' && c.targetId === clickedObj.id; 
                });

                if (clickMatches) {
                    var met = true;
                    eventBlock.conditions.forEach(function (cond) {
                        if (cond.type === 'keydown' && !App.keys[cond.key]) met = false;
                    });

                    if (met) {
                        eventBlock.actions.forEach(function (act) { 
                            executeAction(act, 1); 
                        });
                    }
                }
            });
        }
    } else if (!App.isPlaying) {
        if (pickResult.hit && pickResult.pickedMesh) {
            var hitMesh = pickResult.pickedMesh;
            while (hitMesh.parent && hitMesh.parent.name !== '__root__') {
                hitMesh = hitMesh.parent;
            }

            var clickedObj = null;
            for (var i = 0; i < App.objects.length; i++) {
                var obj = App.objects[i];
                if (obj.mesh === pickResult.pickedMesh || obj.mesh === hitMesh || 
                   (obj.mesh.getChildren && obj.mesh.getChildren().indexOf(pickResult.pickedMesh) !== -1)) {
                    clickedObj = obj;
                    break;
                }
            }

            if (clickedObj) selectObject(clickedObj.id);
        } else {
            selectObject(null);
        }
    }
};

// First Person Camera Mouse Rotation Handler
document.addEventListener('mousemove', function (e) {
    if (App.isPlaying && document.pointerLockElement === App.canvas) {
        App.objects.forEach(function (obj) {
            if (obj.fpsControl && obj.mesh) {
                obj.mesh.rotation.y += e.movementX * 0.002;
                obj.mesh.rotation.x += e.movementY * 0.002;

                // Restrict pitch to avoid flipping upside down
                if (obj.mesh.rotation.x > Math.PI / 2) obj.mesh.rotation.x = Math.PI / 2;
                if (obj.mesh.rotation.x < -Math.PI / 2) obj.mesh.rotation.x = -Math.PI / 2;
            }
        });
    }
});

// Single point of action execution dispatch
function executeAction(action, multiplier) {
    if (action.type === 'lock_mouse') {
        var lockPointer = function () {
            App.canvas.requestPointerLock = App.canvas.requestPointerLock || App.canvas.mozRequestPointerLock || App.canvas.webkitRequestPointerLock;
            if (App.canvas.requestPointerLock) App.canvas.requestPointerLock();
        };
        lockPointer();
        App.canvas.addEventListener('click', lockPointer, { once: true });
        return;
    }

    if (action.type === 'custom_js') {
        try {
            var func = new Function('scene', 'objects', action.jsCode || '');
            func(App.scene, App.objects);
        } catch (e) {
            console.error('Custom JS Action Error:', e);
        }
        return;
    }

    // Call registered extension scripts if active
    if (window.WDevelop.actions[action.type]) {
        var ext = window.WDevelop.actions[action.type];
        try {
            var targetObj1 = findObject(action.targetId);
            var targetObj2 = findObject(action.targetId2);
            var m1 = targetObj1 ? targetObj1.mesh : null;
            var m2 = targetObj2 ? targetObj2.mesh : null;
            var fn = new Function('mesh', 'mesh2', 'speed', 'multiplier', 'scene', ext.codeStr);
            fn(m1, m2, action.speed, multiplier, App.scene);
        } catch (e) {
            console.error('Ext Action Error:', e);
        }
        return;
    }

    if (!action.targetId) return;
    var obj = findObject(action.targetId);
    if (!obj || !obj.mesh) return;

    var speed = action.speed * multiplier;
    var val = action.speed;

    // Dispatch table for extremely fast, switchless actions
    var actionHandlers = {
        rotate_x: function (o, s) { o.mesh.rotation.x += s; },
        rotate_y: function (o, s) { o.mesh.rotation.y += s; },
        rotate_z: function (o, s) { o.mesh.rotation.z += s; },
        move_x: function (o, s) { o.mesh.position.x += s; },
        move_y: function (o, s) { o.mesh.position.y += s; },
        move_z: function (o, s) { o.mesh.position.z += s; },
        set_pos_x: function (o, s, v) { o.mesh.position.x = v; },
        set_pos_y: function (o, s, v) { o.mesh.position.y = v; },
        set_pos_z: function (o, s, v) { o.mesh.position.z = v; },
        scale_up: function (o, s) { o.mesh.scaling.addInPlace(new BABYLON.Vector3(s, s, s)); },
        scale_down: function (o, s) { o.mesh.scaling.subtractInPlace(new BABYLON.Vector3(s, s, s)); },
        hide: function (o) { o.mesh.isVisible = false; },
        show: function (o) { o.mesh.isVisible = true; },
        destroy: function (o) {
            o.mesh.dispose();
            unregisterObject(action.targetId);
        },
        look_at: function (o) {
            var targetObj = findObject(action.targetId2);
            if (targetObj && targetObj.mesh) {
                o.mesh.lookAt(targetObj.mesh.position);
            }
        },
        set_camera: function (o) {
            var cam = o.mesh.getChildren().filter(function (child) { 
                return child instanceof BABYLON.Camera; 
            })[0];

            if (!cam) {
                cam = new BABYLON.TargetCamera('cam_' + o.id, BABYLON.Vector3.Zero(), App.scene);
                cam.parent = o.mesh;
                cam.rotation = BABYLON.Vector3.Zero();
            }
            App.scene.activeCamera = cam;
            App.renderPipeline.addCamera(cam);
        },
        move_fps: function (o, s) {
            var forward = new BABYLON.Vector3(Math.sin(o.mesh.rotation.y), 0, Math.cos(o.mesh.rotation.y));
            var right = new BABYLON.Vector3(Math.cos(o.mesh.rotation.y), 0, -Math.sin(o.mesh.rotation.y));
            if (App.keys['w']) o.mesh.position.addInPlace(forward.scale(s));
            if (App.keys['s']) o.mesh.position.addInPlace(forward.scale(-s));
            if (App.keys['d']) o.mesh.position.addInPlace(right.scale(s));
            if (App.keys['a']) o.mesh.position.addInPlace(right.scale(-s));
        },
        jump: function (o, s, v) {
            if (o._velocityY === undefined) o._velocityY = 0;
            if (o._grounded === undefined) o._grounded = false;
            
            o._velocityY -= 9.8 * multiplier;
            o.mesh.position.y += o._velocityY * multiplier;
            
            if (o.mesh.position.y <= v) {
                o.mesh.position.y = v;
                o._velocityY = 0;
                o._grounded = true;
            } else {
                o._grounded = false;
            }
            
            if (App.keys[' '] && o._grounded) {
                o._velocityY = 5;
                o._grounded = false;
            }
        },
        sync_rotation: function (o) {
            var target = findObject(action.targetId2);
            if (target && target.mesh) {
                o.mesh.rotation.x = target.mesh.rotation.x;
                o.mesh.rotation.y = target.mesh.rotation.y;
                o.mesh.rotation.z = target.mesh.rotation.z;
            }
        },
        set_parent: function (o) {
            var parentObj = findObject(action.targetId2);
            if (parentObj && parentObj.mesh && !o.mesh.parent) {
                o.mesh.parent = parentObj.mesh;
            }
        }
    };

    if (actionHandlers[action.type]) {
        actionHandlers[action.type](obj, speed, val);
    }
}

dom.btnStop.addEventListener('click', function () {
    if (!App.isPlaying) return;
    App.isPlaying = false;
    App.keys = {};
    activeKeysPrev = {};

    dom.btnStop.style.display = 'none';
    dom.btnPlay.style.display = 'flex';

    if (logicObserver) {
        App.scene.onBeforeRenderObservable.remove(logicObserver);
        logicObserver = null;
    }

    App.objects.forEach(function (obj) {
        if (obj.mesh && obj.originalState && !obj.mesh.isDisposed()) {
            obj.mesh.position.copyFrom(obj.originalState.position);
            obj.mesh.rotation.copyFrom(obj.originalState.rotation);
            obj.mesh.scaling.copyFrom(obj.originalState.scaling);
            obj.mesh.isVisible = obj.originalState.isVisible;
        }
    });

    App.scene.activeCamera = App.editorCamera;
    App.editorCamera.attachControl(App.canvas, true);
    App.renderPipeline.addCamera(App.editorCamera);

    if (App.selectedObjectId) selectObject(App.selectedObjectId);
});
