/*
 *  WDevelop — UI Wiring
 *  --------------------
 *  Tabs, toolbar, settings sliders, extension panel.
 *  Basically everything the user clicks on that isn't
 *  directly about 3D objects or the event system.
 */

// ---- cached DOM refs ----

var dom = {
    tabScene:       document.getElementById('tab-scene'),
    tabEvents:      document.getElementById('tab-events'),
    tabSettings:    document.getElementById('tab-settings'),
    tabExtensions:  document.getElementById('tab-extensions'),
    viewScene:      document.getElementById('view-scene'),
    viewEvents:     document.getElementById('view-events'),
    viewSettings:   document.getElementById('view-settings'),
    viewExtensions: document.getElementById('view-extensions'),
    btnPlay:        document.getElementById('btn-play'),
    btnStop:        document.getElementById('btn-stop'),
    addMenuBtns:    document.querySelectorAll('.add-item'),
    objectList:     document.getElementById('object-list'),
    propsPanel:     document.getElementById('properties-panel'),
    btnAddEvent:    document.getElementById('btn-add-event'),
    eventsList:     document.getElementById('events-list')
};


// ---- tab switching ----

var allTabs  = [dom.tabScene, dom.tabEvents, dom.tabSettings, dom.tabExtensions];
var allViews = [dom.viewScene, dom.viewEvents, dom.viewSettings, dom.viewExtensions];

function switchTab(tabId) {
    allTabs.forEach(function (t) { t.classList.remove('active'); });
    allViews.forEach(function (v) { v.style.display = 'none'; });

    document.getElementById('tab-' + tabId).classList.add('active');
    document.getElementById('view-' + tabId).style.display = 'block';

    // babylon needs a kick after we hide/show the canvas container
    if (tabId === 'scene') App.engine.resize();
    if (tabId === 'events') renderEvents();
}

dom.tabScene.addEventListener('click', function ()      { switchTab('scene'); });
dom.tabEvents.addEventListener('click', function ()     { switchTab('events'); });
dom.tabSettings.addEventListener('click', function ()   { switchTab('settings'); });
dom.tabExtensions.addEventListener('click', function () { switchTab('extensions'); });


// ---- settings sliders ----
// these talk directly to the pipeline — nothing fancy

document.getElementById('set-msaa').addEventListener('change', function (e) {
    App.renderPipeline.samples = e.target.checked ? 4 : 1;
});

document.getElementById('set-bloom').addEventListener('change', function (e) {
    App.renderPipeline.bloomEnabled = e.target.checked;
});

document.getElementById('set-bloom-weight').addEventListener('input', function (e) {
    App.renderPipeline.bloomWeight = parseFloat(e.target.value);
});

document.getElementById('set-bloom-threshold').addEventListener('input', function (e) {
    App.renderPipeline.bloomThreshold = parseFloat(e.target.value);
});

document.getElementById('set-exposure').addEventListener('input', function (e) {
    App.scene.imageProcessingConfiguration.exposure = parseFloat(e.target.value);
});


// ---- toolbar (move / rotate / scale) ----

var toolShortcuts = { '1': 'move', '2': 'rotate', '3': 'scale' };

function setTool(tool) {
    if (App.isPlaying) return;
    App.currentTool = tool;

    document.querySelectorAll('.tool-btn').forEach(function (b) { b.classList.remove('active'); });
    document.getElementById('tool-' + tool).classList.add('active');

    var gm = App.gizmoManager;
    gm.positionGizmoEnabled = (tool === 'move');
    gm.rotationGizmoEnabled = (tool === 'rotate');
    gm.scaleGizmoEnabled    = (tool === 'scale');

    // hook up the "sync properties panel while dragging" callback
    if (tool === 'move'   && gm.gizmos.positionGizmo) gm.gizmos.positionGizmo.onDragObservable.add(window.syncPropertiesFromMesh);
    if (tool === 'rotate' && gm.gizmos.rotationGizmo) gm.gizmos.rotationGizmo.onDragObservable.add(window.syncPropertiesFromMesh);
    if (tool === 'scale'  && gm.gizmos.scaleGizmo)    gm.gizmos.scaleGizmo.onDragObservable.add(window.syncPropertiesFromMesh);
}

setTool('move');

document.getElementById('tool-move').addEventListener('click', function ()   { setTool('move'); });
document.getElementById('tool-rotate').addEventListener('click', function () { setTool('rotate'); });
document.getElementById('tool-scale').addEventListener('click', function ()  { setTool('scale'); });

// keyboard shortcuts for tools (ignore if user is typing in an input)
window.addEventListener('keydown', function (e) {
    var tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

    if (toolShortcuts[e.key]) {
        setTool(toolShortcuts[e.key]);
    }
});


// ---- extensions panel ----

function renderExtensions() {
    var list = document.getElementById('extensions-list');
    list.innerHTML = '';

    App.extensions.forEach(function (ext, idx) {
        var card = document.createElement('div');
        card.className = 'gd-event';
        card.style.padding = '15px';
        card.style.display = 'block';

        // header row: name + author
        var header = document.createElement('div');
        header.style.cssText = 'display:flex; gap:10px; margin-bottom:5px;';

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Extension Name';
        nameInput.value = ext.name || '';
        nameInput.style.cssText = 'flex:2; background:transparent; color:#fff; border:none; border-bottom:1px solid #555; font-size:1.1rem; outline:none; padding-bottom:5px;';
        nameInput.addEventListener('change', function () { ext.name = this.value; });

        var authorInput = document.createElement('input');
        authorInput.type = 'text';
        authorInput.placeholder = 'Author';
        authorInput.value = ext.author || '';
        authorInput.style.cssText = 'flex:1; background:transparent; color:#bbb; border:none; border-bottom:1px solid #555; font-size:0.9rem; outline:none; padding-bottom:5px;';
        authorInput.addEventListener('change', function () { ext.author = this.value; });

        header.appendChild(nameInput);
        header.appendChild(authorInput);

        // description
        var descInput = document.createElement('input');
        descInput.type = 'text';
        descInput.placeholder = 'Description...';
        descInput.value = ext.description || '';
        descInput.style.cssText = 'width:100%; background:transparent; color:#bbb; border:none; border-bottom:1px solid #555; font-size:0.85rem; outline:none; padding-bottom:5px; margin-bottom:10px;';
        descInput.addEventListener('change', function () { ext.description = this.value; });

        // code editor
        var codeArea = document.createElement('textarea');
        codeArea.style.cssText = 'width:100%; height:150px; background:#111; color:#0f0; border:1px solid #333; font-family:monospace; padding:10px;';
        codeArea.value = ext.code;
        codeArea.addEventListener('change', function () { ext.code = this.value; });

        // buttons
        var btnRow = document.createElement('div');
        btnRow.style.cssText = 'margin-top:10px; display:flex; gap:10px;';

        var btnRun = document.createElement('button');
        btnRun.className = 'btn-primary';
        btnRun.innerHTML = '<i class="fa-solid fa-play"></i> Run';
        btnRun.addEventListener('click', function () { runExtension(idx); });

        var btnExport = document.createElement('button');
        btnExport.className = 'btn-primary';
        btnExport.style.backgroundColor = 'var(--item-bg)';
        btnExport.innerHTML = '<i class="fa-solid fa-download"></i> Export';
        btnExport.addEventListener('click', function () { exportExtension(idx); });

        var btnDel = document.createElement('button');
        btnDel.className = 'btn-stop';
        btnDel.innerHTML = '<i class="fa-solid fa-trash"></i> Delete';
        btnDel.addEventListener('click', function () { deleteExtension(idx); });

        btnRow.appendChild(btnRun);
        btnRow.appendChild(btnExport);
        btnRow.appendChild(btnDel);

        card.appendChild(header);
        card.appendChild(descInput);
        card.appendChild(codeArea);
        card.appendChild(btnRow);
        list.appendChild(card);
    });
}

document.getElementById('btn-add-extension').addEventListener('click', function () {
    App.extensions.push({
        name: 'My Custom Extension',
        author: 'Unknown',
        description: 'A cool logic extension',
        code: [
            '// register a new action for the event system',
            'window.WDevelop.registerAction(',
            '    "my_action",',
            '    "My Custom Action",',
            '    "fa-star",',
            '    true,   // needs target object',
            '    false,  // no second target',
            '    true,   // has speed/value',
            '    "if (mesh) mesh.position.y += speed;"',
            ');'
        ].join('\n')
    });
    renderExtensions();
});

document.getElementById('btn-import-extension').addEventListener('click', function () {
    document.getElementById('file-ext-import').click();
});

document.getElementById('file-ext-import').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (loadEvent) {
        try {
            var data = JSON.parse(loadEvent.target.result);
            if (data.code) {
                App.extensions.push(data);
                renderExtensions();
                alert("Extension imported!");
            }
        } catch (err) {
            alert("Bad .wext file — couldn't parse it.");
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});

function runExtension(idx) {
    try {
        new Function(App.extensions[idx].code)();
    } catch (err) {
        alert("Extension error:\n" + err.message);
    }
}

// gotta be on window so the old inline handlers still work during transition
window.runExtension = runExtension;

function exportExtension(idx) {
    var ext = App.extensions[idx];
    var blob = new Blob([JSON.stringify(ext)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = (ext.name || 'extension').replace(/\s+/g, '_') + '.wext';
    link.click();
    URL.revokeObjectURL(url);
}

window.exportExtension = exportExtension;

function deleteExtension(idx) {
    App.extensions.splice(idx, 1);
    renderExtensions();
}

window.deleteExtension = deleteExtension;
