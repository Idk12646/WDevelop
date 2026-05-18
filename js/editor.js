/*
 *  WDevelop — Scene Editor
 *  -----------------------
 *  Creating / selecting / deleting 3D objects,
 *  the object list sidebar, and the properties panel.
 */


// ---- adding objects from the toolbar ----

dom.addMenuBtns.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
        var type = e.currentTarget.getAttribute('data-type');
        if (type === 'model') {
            document.getElementById('file-model').click();
        } else {
            createPrimitive(type);
        }
    });
});

document.getElementById('file-model').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (ev) {
        importModel(ev.target.result, file.name);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
});


// ---- model import ----

function importModel(dataUrl, fileName, saved) {
    App.nextObjectId++;
    var id   = saved ? saved.id   : 'obj_' + App.nextObjectId;
    var name = saved ? saved.name : fileName.split('.')[0];

    BABYLON.SceneLoader.ImportMeshAsync("", dataUrl, "", App.scene).then(function (result) {
        var root = result.meshes[0];
        root.id = id;
        root.name = name;

        // babylon imports with quaternions by default — we want euler angles
        root.rotationQuaternion = null;

        result.meshes.forEach(function (child) {
            if (child !== root) {
                App.shadowGenerator.addShadowCaster(child, true);
                child.receiveShadows = true;
            }
        });

        if (saved) {
            root.position = new BABYLON.Vector3(saved.position.x, saved.position.y, saved.position.z);
            root.rotation = new BABYLON.Vector3(saved.rotation.x, saved.rotation.y, saved.rotation.z);
            root.scaling  = new BABYLON.Vector3(saved.scaling.x, saved.scaling.y, saved.scaling.z);
        } else {
            root.position.y = 0;
        }

        var obj = { id: id, name: name, type: 'model', mesh: root, modelData: dataUrl, originalState: null };
        registerObject(obj);
        refreshObjectList();
        if (!saved) selectObject(id);
    });
}


// ---- primitive creation (box, sphere, etc.) ----

// each type knows how to build its mesh. cleaner than a switch.
var primitiveBuilders = {
    box: function (name) {
        return BABYLON.MeshBuilder.CreateBox(name, { size: 2 }, App.scene);
    },
    sphere: function (name) {
        return BABYLON.MeshBuilder.CreateSphere(name, { diameter: 2 }, App.scene);
    },
    plane: function (name) {
        var m = BABYLON.MeshBuilder.CreatePlane(name, { size: 2 }, App.scene);
        m.rotation.x = Math.PI / 2;
        return m;
    },
    light: function (name, id, mat) {
        var m = BABYLON.MeshBuilder.CreateSphere(name, { diameter: 0.5 }, App.scene);
        var bulb = new BABYLON.PointLight('light_' + id, BABYLON.Vector3.Zero(), App.scene);
        bulb.parent = m;
        mat.emissiveColor = new BABYLON.Color3(1, 1, 0);
        mat.disableLighting = true;
        return m;
    },
    camera: function (name, id, mat) {
        var body = BABYLON.MeshBuilder.CreateBox(name, { size: 0.6, depth: 1.2 }, App.scene);
        var lens = BABYLON.MeshBuilder.CreateCylinder("lens", { diameter: 0.4, height: 0.3 }, App.scene);
        lens.rotation.x = Math.PI / 2;
        lens.position.z = 0.6;
        lens.parent = body;
        mat.albedoColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        return body;
    }
};

function createPrimitive(type) {
    App.nextObjectId++;
    var id   = 'obj_' + App.nextObjectId;
    var name = type.charAt(0).toUpperCase() + type.slice(1) + ' ' + App.nextObjectId;

    var mat = new BABYLON.PBRMaterial('mat_' + id, App.scene);
    mat.albedoColor = new BABYLON.Color3(
        Math.random() * 0.8 + 0.2,
        Math.random() * 0.8 + 0.2,
        Math.random() * 0.8 + 0.2
    );
    mat.metallic  = 0.5;
    mat.roughness = 0.5;

    var builder = primitiveBuilders[type];
    if (!builder) return;

    var mesh = builder(name, id, mat);
    mesh.position.y = 1;
    mesh.material = mat;

    // lights and cameras are visual gizmos, they shouldn't cast shadows
    if (type !== 'light' && type !== 'camera') {
        App.shadowGenerator.addShadowCaster(mesh, true);
        mesh.receiveShadows = true;
    }

    var obj = { id: id, name: name, type: type, mesh: mesh, originalState: null, fpsControl: false };
    registerObject(obj);
    refreshObjectList();
    selectObject(id);
}


// ---- object list (left sidebar) ----

var typeIcons = {
    box: 'fa-cube', sphere: 'fa-circle', plane: 'fa-square',
    light: 'fa-lightbulb', camera: 'fa-video', model: 'fa-file-import'
};

function refreshObjectList() {
    dom.objectList.innerHTML = '';

    App.objects.forEach(function (obj) {
        var row = document.createElement('div');
        row.className = 'object-item' + (obj.id === App.selectedObjectId ? ' selected' : '');

        var icon = typeIcons[obj.type] || 'fa-cube';
        row.innerHTML = '<i class="fa-solid ' + icon + '"></i> <span>' + obj.name + '</span>';
        row.addEventListener('click', function () { selectObject(obj.id); });

        dom.objectList.appendChild(row);
    });
}


// ---- selection ----

function selectObject(id) {
    App.selectedObjectId = id;
    refreshObjectList();

    // clear all bounding boxes first
    App.objects.forEach(function (o) {
        if (o.mesh) o.mesh.showBoundingBox = false;
    });

    if (id && !App.isPlaying) {
        var obj = findObject(id);
        if (obj && obj.mesh) {
            obj.mesh.showBoundingBox = true;
            App.gizmoManager.attachToMesh(obj.mesh);
        }
    } else {
        App.gizmoManager.attachToMesh(null);
    }

    refreshPropertiesPanel();
}


// ---- deleting objects ----

function deleteObject(id) {
    var obj = findObject(id);
    if (obj && obj.mesh) {
        // clean up shadow casters
        if (obj.type !== 'light' && obj.type !== 'camera') {
            if (obj.type === 'model') {
                obj.mesh.getChildMeshes().forEach(function (child) {
                    App.shadowGenerator.removeShadowCaster(child);
                });
            } else {
                App.shadowGenerator.removeShadowCaster(obj.mesh);
            }
        }
        obj.mesh.dispose();
        if (obj.mesh.material) obj.mesh.material.dispose();
    }

    unregisterObject(id);

    // also nuke any event references to this object
    App.events.forEach(function (block) {
        block.conditions = block.conditions.filter(function (cond) { return cond.targetId !== id; });
        block.actions    = block.actions.filter(function (act) { return act.targetId !== id; });
    });

    selectObject(null);
    renderEvents();
}


// ---- properties panel (right sidebar) ----

function buildVectorInputs(label, vec, propName) {
    return '' +
        '<div class="prop-group">' +
            '<label>' + label + '</label>' +
            '<div class="prop-row">' +
                '<div class="prop-input-wrap"><span>X</span><input type="number" step="0.1" value="' + vec.x.toFixed(2) + '" data-prop="' + propName + '" data-axis="x"></div>' +
                '<div class="prop-input-wrap"><span>Y</span><input type="number" step="0.1" value="' + vec.y.toFixed(2) + '" data-prop="' + propName + '" data-axis="y"></div>' +
                '<div class="prop-input-wrap"><span>Z</span><input type="number" step="0.1" value="' + vec.z.toFixed(2) + '" data-prop="' + propName + '" data-axis="z"></div>' +
            '</div>' +
        '</div>';
}

function refreshPropertiesPanel() {
    if (!App.selectedObjectId) {
        dom.propsPanel.innerHTML = '<div class="empty-state">Select an object to edit properties</div>';
        return;
    }

    var obj = findObject(App.selectedObjectId);
    if (!obj) return;

    // rotation: convert from radians to degrees for the UI
    var rot = obj.mesh.rotationQuaternion ? obj.mesh.rotationQuaternion.toEulerAngles() : obj.mesh.rotation;
    var rotDeg = new BABYLON.Vector3(
        BABYLON.Tools.ToDegrees(rot.x),
        BABYLON.Tools.ToDegrees(rot.y),
        BABYLON.Tools.ToDegrees(rot.z)
    );

    // build the material section (only for primitives, not cameras/models)
    var materialHtml = '';
    if (obj.type !== 'camera' && obj.type !== 'model' && obj.mesh.material) {
        var hex = obj.mesh.material.albedoColor ? obj.mesh.material.albedoColor.toHexString() : '#ffffff';
        var metal = (obj.mesh.material.metallic || 0).toFixed(2);
        var rough = (obj.mesh.material.roughness || 0).toFixed(2);
        var glow  = (obj.mesh.material.emissiveColor ? obj.mesh.material.emissiveColor.r : 0).toFixed(2);

        materialHtml =
        '<div class="prop-group">' +
            '<label>Material (PBR)</label>' +
            '<div class="prop-row" style="align-items:center;">' +
                '<span style="font-size:0.85rem; color:var(--text-muted); flex:1;">Color</span>' +
                '<input type="color" id="prop-color" value="' + hex + '" style="width:50px; height:30px; border:none; background:none; cursor:pointer;">' +
            '</div>' +
            '<div style="margin-top:10px;">' +
                '<div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-muted);"><span>Texture Image</span>' +
                '<button id="btn-upload-tex" class="icon-btn" style="padding: 2px 8px;"><i class="fa-solid fa-upload"></i> Upload</button></div>' +
            '</div>' +
            '<div style="margin-top:10px;">' +
                '<div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-muted);"><span>Metallic</span><span id="val-metal">' + metal + '</span></div>' +
                '<input type="range" id="prop-metal" min="0" max="1" step="0.05" value="' + (obj.mesh.material.metallic || 0) + '" style="width:100%;">' +
            '</div>' +
            '<div style="margin-top:10px;">' +
                '<div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-muted);"><span>Roughness</span><span id="val-rough">' + rough + '</span></div>' +
                '<input type="range" id="prop-rough" min="0" max="1" step="0.05" value="' + (obj.mesh.material.roughness || 0) + '" style="width:100%;">' +
            '</div>' +
            '<div style="margin-top:10px;">' +
                '<div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-muted);"><span>Glow (Bloom)</span><span id="val-glow">' + glow + '</span></div>' +
                '<input type="range" id="prop-glow" min="0" max="3" step="0.1" value="' + (obj.mesh.material.emissiveColor ? obj.mesh.material.emissiveColor.r : 0) + '" style="width:100%;">' +
            '</div>' +
        '</div>';
    }

    dom.propsPanel.innerHTML =
        '<div class="prop-group">' +
            '<label>Name</label>' +
            '<div class="prop-row"><div class="prop-input-wrap"><input type="text" value="' + obj.name + '" id="prop-name"></div></div>' +
        '</div>' +
        buildVectorInputs('Position', obj.mesh.position, 'position') +
        buildVectorInputs('Rotation (Deg)', rotDeg, 'rotation') +
        buildVectorInputs('Scale', obj.mesh.scaling, 'scaling') +
        materialHtml +
        '<div class="prop-group" style="margin-top:10px;">' +
            '<label>Controls</label>' +
            '<div style="margin-top:5px;">' +
                '<label style="font-size:0.85rem; display:flex; align-items:center; gap:8px;">' +
                    '<input type="checkbox" id="prop-fps" ' + (obj.fpsControl ? 'checked' : '') + '>' +
                    'Bind Mouse to Rotation (FPS)' +
                '</label>' +
            '</div>' +
        '</div>' +
        '<button id="btn-delete-obj" class="btn-stop" style="width:100%; margin-top:15px; justify-content:center;">' +
            '<i class="fa-solid fa-trash"></i> Delete Object' +
        '</button>';

    // ---- wire up the property inputs ----

    document.getElementById('prop-name').addEventListener('change', function (e) {
        obj.name = e.target.value;
        refreshObjectList();
        renderEvents();
    });

    document.getElementById('prop-fps').addEventListener('change', function (e) {
        obj.fpsControl = e.target.checked;
    });

    document.getElementById('btn-delete-obj').addEventListener('click', function () {
        deleteObject(obj.id);
    });

    // position / rotation / scale number inputs
    dom.propsPanel.querySelectorAll('input[type="number"]').forEach(function (input) {
        input.addEventListener('change', function (e) {
            var prop = e.target.getAttribute('data-prop');
            var axis = e.target.getAttribute('data-axis');
            var val  = parseFloat(e.target.value);

            if (prop === 'position' || prop === 'scaling') {
                obj.mesh[prop][axis] = val;
            } else if (prop === 'rotation') {
                obj.mesh.rotation[axis] = BABYLON.Tools.ToRadians(val);
                obj.mesh.rotationQuaternion = null;
            }
        });
    });

    // material sliders (only if this object has a material panel)
    if (obj.mesh.material && obj.type !== 'camera' && obj.type !== 'model') {
        document.getElementById('btn-upload-tex').addEventListener('click', function () {
            document.getElementById('file-texture').click();
        });

        document.getElementById('file-texture').onchange = function (e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (ev) {
                obj.textureData = ev.target.result;
                obj.mesh.material.albedoTexture = new BABYLON.Texture(obj.textureData, App.scene);
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        };

        document.getElementById('prop-color').addEventListener('input', function (e) {
            obj.mesh.material.albedoColor = BABYLON.Color3.FromHexString(e.target.value);
        });

        document.getElementById('prop-metal').addEventListener('input', function (e) {
            var v = parseFloat(e.target.value);
            obj.mesh.material.metallic = v;
            document.getElementById('val-metal').innerText = v.toFixed(2);
        });

        document.getElementById('prop-rough').addEventListener('input', function (e) {
            var v = parseFloat(e.target.value);
            obj.mesh.material.roughness = v;
            document.getElementById('val-rough').innerText = v.toFixed(2);
        });

        document.getElementById('prop-glow').addEventListener('input', function (e) {
            var v = parseFloat(e.target.value);
            obj.mesh.material.emissiveColor = new BABYLON.Color3(v, v, v);
            document.getElementById('val-glow').innerText = v.toFixed(1);
        });
    }
}
