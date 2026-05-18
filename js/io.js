/*
 *  WDevelop — Serialization & Project Exporter
 *  --------------------------------------------
 *  Handles saving and loading the project structure (.wdev JSON files),
 *  and compiling the standalone single-file HTML executable.
 */

// ---- Save Project State ----

document.getElementById('btn-save').addEventListener('click', function () {
    var serializedObjects = App.objects.map(function (obj) {
        var data = {
            id: obj.id,
            name: obj.name,
            type: obj.type,
            fpsControl: obj.fpsControl,
            position: { x: obj.mesh.position.x, y: obj.mesh.position.y, z: obj.mesh.position.z },
            rotation: { x: obj.mesh.rotation.x, y: obj.mesh.rotation.y, z: obj.mesh.rotation.z },
            scaling: { x: obj.mesh.scaling.x, y: obj.mesh.scaling.y, z: obj.mesh.scaling.z }
        };

        if (obj.type === 'model') {
            data.modelData = obj.modelData;
        } else if (obj.type !== 'camera' && obj.mesh.material) {
            data.color = obj.mesh.material.albedoColor ? obj.mesh.material.albedoColor.toHexString() : '#ffffff';
            data.metallic = obj.mesh.material.metallic;
            data.roughness = obj.mesh.material.roughness;
            data.emissive = obj.mesh.material.emissiveColor ? obj.mesh.material.emissiveColor.r : 0;
            if (obj.textureData) {
                data.textureData = obj.textureData;
            }
        }
        return data;
    });

    var projectData = {
        objectIdCounter: App.nextObjectId,
        eventIdCounter: App.nextEventId,
        objects: serializedObjects,
        events: App.events,
        extensions: App.extensions,
        settings: {
            msaa: App.renderPipeline.samples,
            bloom: App.renderPipeline.bloomEnabled,
            bloomWeight: App.renderPipeline.bloomWeight,
            bloomThreshold: App.renderPipeline.bloomThreshold,
            exposure: App.scene.imageProcessingConfiguration.exposure
        }
    };

    var blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'project.wdev';
    a.click();
    URL.revokeObjectURL(url);
});


// ---- Load Project State ----

document.getElementById('btn-open').addEventListener('click', function () {
    document.getElementById('file-open').click();
});

document.getElementById('file-open').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (ev) {
        try {
            var data = JSON.parse(ev.target.result);

            // Clean up existing editor scene completely
            App.objects.forEach(function (obj) {
                if (obj.type !== 'light' && obj.type !== 'camera') {
                    if (obj.type === 'model') {
                        obj.mesh.getChildMeshes().forEach(function (m) { 
                            App.shadowGenerator.removeShadowCaster(m); 
                        });
                    } else {
                        App.shadowGenerator.removeShadowCaster(obj.mesh);
                    }
                }
                obj.mesh.dispose();
                if (obj.mesh.material) obj.mesh.material.dispose();
            });

            App.objects = [];
            App.objectMap = {};
            App.events = [];
            selectObject(null);

            App.nextObjectId = data.objectIdCounter || 0;
            App.nextEventId = data.eventIdCounter || 0;
            App.events = data.events || [];
            App.extensions = data.extensions || [];

            (data.objects || []).forEach(function (oData) {
                if (oData.type === 'model') {
                    importModel(oData.modelData, oData.name, oData);
                    return;
                }

                var mesh;
                var mat = new BABYLON.PBRMaterial('mat_' + oData.id, App.scene);

                if (oData.color) mat.albedoColor = BABYLON.Color3.FromHexString(oData.color);
                mat.metallic = oData.metallic !== undefined ? oData.metallic : 0.5;
                mat.roughness = oData.roughness !== undefined ? oData.roughness : 0.5;
                
                if (oData.emissive !== undefined) {
                    mat.emissiveColor = new BABYLON.Color3(oData.emissive, oData.emissive, oData.emissive);
                }
                if (oData.textureData) {
                    mat.albedoTexture = new BABYLON.Texture(oData.textureData, App.scene);
                    oData.textureDataObj = oData.textureData;
                }

                var builders = {
                    box: function (n) { return BABYLON.MeshBuilder.CreateBox(n, { size: 2 }, App.scene); },
                    sphere: function (n) { return BABYLON.MeshBuilder.CreateSphere(n, { diameter: 2 }, App.scene); },
                    plane: function (n) { return BABYLON.MeshBuilder.CreatePlane(n, { size: 2 }, App.scene); },
                    light: function (n, id, mat) {
                        var m = BABYLON.MeshBuilder.CreateSphere(n, { diameter: 0.5 }, App.scene);
                        mat.disableLighting = true;
                        var pl = new BABYLON.PointLight('pl_' + id, BABYLON.Vector3.Zero(), App.scene);
                        pl.parent = m;
                        return m;
                    },
                    camera: function (n) { return BABYLON.MeshBuilder.CreateBox(n, { size: 0.6, depth: 1.2 }, App.scene); }
                };

                if (builders[oData.type]) {
                    mesh = builders[oData.type](oData.name, oData.id, mat);
                }

                if (mesh) {
                    mesh.material = mat;
                    mesh.position = new BABYLON.Vector3(oData.position.x, oData.position.y, oData.position.z);
                    mesh.rotation = new BABYLON.Vector3(oData.rotation.x, oData.rotation.y, oData.rotation.z);
                    mesh.scaling = new BABYLON.Vector3(oData.scaling.x, oData.scaling.y, oData.scaling.z);

                    if (oData.type !== 'light' && oData.type !== 'camera') {
                        App.shadowGenerator.addShadowCaster(mesh, true);
                        mesh.receiveShadows = true;
                    }

                    registerObject({ 
                        id: oData.id, 
                        name: oData.name, 
                        type: oData.type, 
                        mesh: mesh, 
                        originalState: null, 
                        textureData: oData.textureDataObj, 
                        fpsControl: oData.fpsControl || false 
                    });
                }
            });

            // Load and restore post-processing settings
            if (data.settings) {
                App.renderPipeline.samples = data.settings.msaa || 4;
                App.renderPipeline.bloomEnabled = !!data.settings.bloom;
                App.renderPipeline.bloomWeight = data.settings.bloomWeight !== undefined ? data.settings.bloomWeight : 0.5;
                App.renderPipeline.bloomThreshold = data.settings.bloomThreshold !== undefined ? data.settings.bloomThreshold : 0.8;
                App.scene.imageProcessingConfiguration.exposure = data.settings.exposure !== undefined ? data.settings.exposure : 1.0;

                // Sync the UI values
                document.getElementById('set-msaa').checked = (App.renderPipeline.samples > 1);
                document.getElementById('set-bloom').checked = App.renderPipeline.bloomEnabled;
                document.getElementById('set-bloom-weight').value = App.renderPipeline.bloomWeight;
                document.getElementById('set-bloom-threshold').value = App.renderPipeline.bloomThreshold;
                document.getElementById('set-exposure').value = App.scene.imageProcessingConfiguration.exposure;
            }

            refreshObjectList();
            renderEvents();
            renderExtensions();

            // Run extension scripts after load
            if (App.extensions) {
                App.extensions.forEach(function (ext) {
                    try { 
                        new Function(ext.code)(); 
                    } catch (e) { 
                        console.error("Extension init error", e); 
                    }
                });
            }

        } catch (err) {
            alert('Failed to load project file.');
            console.error(err);
        }
    };
    reader.readAsText(file);
    document.getElementById('file-open').value = '';
});


// ---- Single-File Executable Standalone Compilation ----

document.getElementById('btn-export').addEventListener('click', function () {
    
    // Build isolated, clean local JS context for the standalone runtime
    var jsCode = [
        'var canvas = document.getElementById("renderCanvas");',
        'var engine = new BABYLON.Engine(canvas, true);',
        '',
        'var createScene = function () {',
        '    var scene = new BABYLON.Scene(engine);',
        '    scene.clearColor = new BABYLON.Color4(0.12, 0.12, 0.14, 1);',
        '    ',
        '    var camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 4, Math.PI / 3, 15, BABYLON.Vector3.Zero(), scene);',
        '    camera.attachControl(canvas, true);',
        '    ',
        '    var envTexture = BABYLON.CubeTexture.CreateFromPrefilteredData("https://playground.babylonjs.com/textures/environment.dds", scene);',
        '    scene.environmentTexture = envTexture;',
        '',
        '    var sunLight = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-1, -2, -1), scene);',
        '    sunLight.position = new BABYLON.Vector3(20, 40, 20);',
        '    sunLight.intensity = 1.5;',
        '',
        '    var ambientLight = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0, 1, 0), scene);',
        '    ambientLight.intensity = 0.3;',
        '',
        '    var shadowGen = new BABYLON.ShadowGenerator(1024, sunLight);',
        '    shadowGen.useBlurExponentialShadowMap = true;',
        '    shadowGen.blurKernel = 32;',
        '',
        '    var ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, scene);',
        '    var groundMat = new BABYLON.PBRMaterial("groundMat", scene);',
        '    groundMat.albedoColor = new BABYLON.Color3(0.3, 0.3, 0.3);',
        '    groundMat.metallic = 0.1;',
        '    groundMat.roughness = 0.8;',
        '    ground.material = groundMat;',
        '    ground.receiveShadows = true;',
        '',
        '    var objects = {};',
        '    window.WDevelop = {',
        '        actions: ' + JSON.stringify(window.WDevelop.actions) + ',',
        '        conditions: ' + JSON.stringify(window.WDevelop.conditions) + '',
        '    };',
        ''
    ].join('\n');

    // Instantiate and hydrate all scene objects
    App.objects.forEach(function (obj) {
        if (obj.type === 'model') {
            jsCode += [
                '    BABYLON.SceneLoader.ImportMeshAsync("", "' + obj.modelData + '", "", scene).then(function (result) {',
                '        var root = result.meshes[0];',
                '        root.rotationQuaternion = null;',
                '        objects["' + obj.id + '"] = root;',
                '        root.position = new BABYLON.Vector3(' + obj.mesh.position.x + ', ' + obj.mesh.position.y + ', ' + obj.mesh.position.z + ');',
                '        root.rotation = new BABYLON.Vector3(' + obj.mesh.rotation.x + ', ' + obj.mesh.rotation.y + ', ' + obj.mesh.rotation.z + ');',
                '        root.scaling = new BABYLON.Vector3(' + obj.mesh.scaling.x + ', ' + obj.mesh.scaling.y + ', ' + obj.mesh.scaling.z + ');',
                '        result.meshes.forEach(function (m) {',
                '            if (m !== root) {',
                '                shadowGen.addShadowCaster(m, true);',
                '                m.receiveShadows = true;',
                '            }',
                '        });',
                '    });'
            ].join('\n') + '\n';
            return;
        }

        var builders = {
            box: function (o) { return 'BABYLON.MeshBuilder.CreateBox("' + o.name + '", { size: 2 }, scene);'; },
            sphere: function (o) { return 'BABYLON.MeshBuilder.CreateSphere("' + o.name + '", { diameter: 2 }, scene);'; },
            plane: function (o) { return 'BABYLON.MeshBuilder.CreatePlane("' + o.name + '", { size: 2 }, scene);'; },
            light: function (o) { 
                return 'BABYLON.MeshBuilder.CreateSphere("' + o.name + '", { diameter: 0.5 }, scene); ' +
                       'var pl = new BABYLON.PointLight("pl_' + o.id + '", BABYLON.Vector3.Zero(), scene); pl.parent = objects["' + o.id + '"];'; 
            },
            camera: function (o) { return 'BABYLON.MeshBuilder.CreateBox("' + o.name + '", { size: 0.6, depth: 1.2 }, scene); objects["' + o.id + '"].isVisible = false;'; }
        };

        var meshStr = builders[obj.type] ? builders[obj.type](obj) : 'null;';

        jsCode += '    objects["' + obj.id + '"] = ' + meshStr + '\n';
        if (obj.fpsControl) {
            jsCode += '    objects["' + obj.id + '"].fpsControl = true;\n';
        }
        jsCode += '    objects["' + obj.id + '"].position = new BABYLON.Vector3(' + obj.mesh.position.x + ', ' + obj.mesh.position.y + ', ' + obj.mesh.position.z + ');\n';
        jsCode += '    objects["' + obj.id + '"].rotation = new BABYLON.Vector3(' + obj.mesh.rotation.x + ', ' + obj.mesh.rotation.y + ', ' + obj.mesh.rotation.z + ');\n';
        jsCode += '    objects["' + obj.id + '"].scaling = new BABYLON.Vector3(' + obj.mesh.scaling.x + ', ' + obj.mesh.scaling.y + ', ' + obj.mesh.scaling.z + ');\n';

        if (obj.mesh.material && obj.type !== 'camera') {
            jsCode += '    var mat_' + obj.id + ' = new BABYLON.PBRMaterial("m_' + obj.id + '", scene);\n';
            if (obj.mesh.material.albedoColor) {
                jsCode += '    mat_' + obj.id + '.albedoColor = BABYLON.Color3.FromHexString("' + obj.mesh.material.albedoColor.toHexString() + '");\n';
            }
            jsCode += '    mat_' + obj.id + '.metallic = ' + (obj.mesh.material.metallic || 0) + ';\n';
            jsCode += '    mat_' + obj.id + '.roughness = ' + (obj.mesh.material.roughness || 0) + ';\n';
            if (obj.mesh.material.emissiveColor) {
                jsCode += '    mat_' + obj.id + '.emissiveColor = new BABYLON.Color3(' + obj.mesh.material.emissiveColor.r + ', ' + obj.mesh.material.emissiveColor.g + ', ' + obj.mesh.material.emissiveColor.b + ');\n';
            }
            if (obj.textureData) {
                jsCode += '    mat_' + obj.id + '.albedoTexture = new BABYLON.Texture("' + obj.textureData + '", scene);\n';
            }
            if (obj.type === 'light') {
                jsCode += '    mat_' + obj.id + '.disableLighting = true;\n';
            }
            jsCode += '    objects["' + obj.id + '"].material = mat_' + obj.id + ';\n';
        }

        if (obj.type !== 'light' && obj.type !== 'camera') {
            jsCode += '    shadowGen.addShadowCaster(objects["' + obj.id + '"], true);\n';
            jsCode += '    objects["' + obj.id + '"].receiveShadows = true;\n';
        }
    });

    // Write runtime controls, loops, and actions dispatch mappings
    jsCode += [
        '',
        '    var keys = {};',
        '    var activeKeysPrev = {};',
        '    scene.onKeyboardObservable.add(function (kbInfo) {',
        '        if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {',
        '            keys[kbInfo.event.key.toLowerCase()] = true;',
        '        } else if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYUP) {',
        '            keys[kbInfo.event.key.toLowerCase()] = false;',
        '        }',
        '    });',
        '    ',
        '    var pipeline = new BABYLON.DefaultRenderingPipeline("default", true, scene, [camera]);',
        '    pipeline.samples = ' + App.renderPipeline.samples + ';',
        '    pipeline.bloomEnabled = ' + App.renderPipeline.bloomEnabled + ';',
        '    pipeline.bloomWeight = ' + App.renderPipeline.bloomWeight + ';',
        '    pipeline.bloomThreshold = ' + App.renderPipeline.bloomThreshold + ';',
        '    scene.imageProcessingConfiguration.exposure = ' + App.scene.imageProcessingConfiguration.exposure + ';',
        '',
        '    document.addEventListener("mousemove", function (e) {',
        '        if (document.pointerLockElement === canvas) {',
        '            Object.keys(objects).forEach(function (id) {',
        '                var o = objects[id];',
        '                if (o.fpsControl) {',
        '                    o.rotation.y += e.movementX * 0.002;',
        '                    o.rotation.x += e.movementY * 0.002;',
        '                    if (o.rotation.x > Math.PI / 2) o.rotation.x = Math.PI / 2;',
        '                    if (o.rotation.x < -Math.PI / 2) o.rotation.x = -Math.PI / 2;',
        '                }',
        '            });',
        '        }',
        '    });',
        '',
        '    function executeAction(type, targetId, targetId2, speed, multiplier, jsCode) {',
        '        if (type === "lock_mouse") {',
        '            var lockFn = function () {',
        '                canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;',
        '                if (canvas.requestPointerLock) canvas.requestPointerLock();',
        '            };',
        '            lockFn();',
        '            canvas.addEventListener("click", lockFn, { once: true });',
        '            return;',
        '        }',
        '',
        '        if (type === "custom_js") {',
        '            try {',
        '                var func = new Function("scene", "objects", jsCode || "");',
        '                func(scene, objects);',
        '            } catch (e) {',
        '                console.error("Custom JS Error", e);',
        '            }',
        '            return;',
        '        }',
        '',
        '        if (window.WDevelop.actions[type]) {',
        '            var m1 = objects[targetId];',
        '            var m2 = objects[targetId2];',
        '            try {',
        '                var fn = new Function("mesh", "mesh2", "speed", "multiplier", "scene", window.WDevelop.actions[type].codeStr);',
        '                fn(m1, m2, speed, multiplier, scene);',
        '            } catch (e) {',
        '                console.error(e);',
        '            }',
        '            return;',
        '        }',
        '',
        '        var mesh = objects[targetId];',
        '        if (!mesh) return;',
        '        var s = speed * multiplier;',
        '',
        '        var actionHandlers = {',
        '            rotate_x: function(m, s) { m.rotation.x += s; },',
        '            rotate_y: function(m, s) { m.rotation.y += s; },',
        '            rotate_z: function(m, s) { m.rotation.z += s; },',
        '            move_x: function(m, s) { m.position.x += s; },',
        '            move_y: function(m, s) { m.position.y += s; },',
        '            move_z: function(m, s) { m.position.z += s; },',
        '            set_pos_x: function(m, s, v) { m.position.x = v; },',
        '            set_pos_y: function(m, s, v) { m.position.y = v; },',
        '            set_pos_z: function(m, s, v) { m.position.z = v; },',
        '            scale_up: function(m, s) { m.scaling.addInPlace(new BABYLON.Vector3(s, s, s)); },',
        '            scale_down: function(m, s) { m.scaling.subtractInPlace(new BABYLON.Vector3(s, s, s)); },',
        '            hide: function(m) { m.isVisible = false; },',
        '            show: function(m) { m.isVisible = true; },',
        '            destroy: function(m) { m.dispose(); delete objects[targetId]; },',
        '            look_at: function(m) { if (objects[targetId2]) m.lookAt(objects[targetId2].position); },',
        '            set_camera: function(m) {',
        '                var cam = m.getChildren().find(function (c) { return c instanceof BABYLON.Camera; });',
        '                if (!cam) {',
        '                    cam = new BABYLON.TargetCamera("cam_" + targetId, BABYLON.Vector3.Zero(), scene);',
        '                    cam.parent = m; cam.rotation = BABYLON.Vector3.Zero();',
        '                }',
        '                scene.activeCamera = cam;',
        '                pipeline.addCamera(cam);',
        '            },',
        '            move_fps: function(m, s) {',
        '                var fwd = new BABYLON.Vector3(Math.sin(m.rotation.y), 0, Math.cos(m.rotation.y));',
        '                var rgt = new BABYLON.Vector3(Math.cos(m.rotation.y), 0, -Math.sin(m.rotation.y));',
        '                if (keys["w"]) m.position.addInPlace(fwd.scale(s));',
        '                if (keys["s"]) m.position.addInPlace(fwd.scale(-s));',
        '                if (keys["d"]) m.position.addInPlace(rgt.scale(s));',
        '                if (keys["a"]) m.position.addInPlace(rgt.scale(-s));',
        '            },',
        '            jump: function(m, s, v) {',
        '                if (m._vy === undefined) m._vy = 0;',
        '                if (m._gr === undefined) m._gr = false;',
        '                m._vy -= 9.8 * multiplier;',
        '                m.position.y += m._vy * multiplier;',
        '                if (m.position.y <= speed) { m.position.y = speed; m._vy = 0; m._gr = true; }',
        '                else { m._gr = false; }',
        '                if (keys[" "] && m._gr) { m._vy = 5; m._gr = false; }',
        '            },',
        '            sync_rotation: function(m) {',
        '                if (objects[targetId2]) {',
        '                    m.rotation.x = objects[targetId2].rotation.x;',
        '                    m.rotation.y = objects[targetId2].rotation.y;',
        '                    m.rotation.z = objects[targetId2].rotation.z;',
        '                }',
        '            },',
        '            set_parent: function(m) {',
        '                if (objects[targetId2] && !m.parent) { m.parent = objects[targetId2]; }',
        '            }',
        '        };',
        '',
        '        if (actionHandlers[type]) {',
        '            actionHandlers[type](mesh, s, speed);',
        '        }',
        '    };',
        ''
    ].join('\n') + '\n';

    // Compile On Start triggers
    var startEvents = App.events.filter(function (e) {
        return e.conditions.some(function (c) { return c.type === 'start'; });
    });
    
    if (startEvents.length > 0) {
        startEvents.forEach(function (evtBlock) {
            evtBlock.actions.forEach(function (act) {
                var codeLiteral = (act.jsCode || '').replace(/`/g, '\\`').replace(/\$/g, '\\$');
                jsCode += "    executeAction('" + act.type + "', '" + act.targetId + "', '" + act.targetId2 + "', " + (act.speed || 0) + ", 1, `" + codeLiteral + "`);\n";
            });
        });
    }

    // Compile Frame Event loop
    jsCode += '    scene.onBeforeRenderObservable.add(function () {\n        var delta = engine.getDeltaTime() / 1000;\n';
    
    App.events.forEach(function (evtBlock) {
        if (evtBlock.conditions.length === 0 || evtBlock.conditions.some(function (c) { return c.type !== 'start' && c.type !== 'pointerdown'; })) {
            var condChecks = [];
            evtBlock.conditions.forEach(function (cond) {
                if (cond.type === 'keydown') {
                    condChecks.push("keys['" + cond.key + "']");
                }
                if (cond.type === 'keyup') {
                    condChecks.push("(activeKeysPrev['" + cond.key + "'] && !keys['" + cond.key + "'])");
                }
                if (cond.type === 'collide') {
                    condChecks.push("(objects['" + cond.targetId + "'] && objects['" + cond.targetId2 + "'] && objects['" + cond.targetId + "'].intersectsMesh(objects['" + cond.targetId2 + "'], false))");
                }
                if (cond.type === 'pos_x_gt') {
                    condChecks.push("(objects['" + cond.targetId + "'] && objects['" + cond.targetId + "'].position.x > " + cond.speed + ")");
                }
                if (cond.type === 'pos_x_lt') {
                    condChecks.push("(objects['" + cond.targetId + "'] && objects['" + cond.targetId + "'].position.x < " + cond.speed + ")");
                }
                if (cond.type === 'pos_y_gt') {
                    condChecks.push("(objects['" + cond.targetId + "'] && objects['" + cond.targetId + "'].position.y > " + cond.speed + ")");
                }
                if (cond.type === 'pos_y_lt') {
                    condChecks.push("(objects['" + cond.targetId + "'] && objects['" + cond.targetId + "'].position.y < " + cond.speed + ")");
                }

                if (window.WDevelop.conditions[cond.type]) {
                    condChecks.push([
                        "(function(){",
                        "    var m1 = objects['" + cond.targetId + "'];",
                        "    var m2 = objects['" + cond.targetId2 + "'];",
                        "    var fn = new Function('mesh', 'mesh2', 'value', 'keys', window.WDevelop.conditions['" + cond.type + "'].codeStr);",
                        "    return fn(m1, m2, " + cond.speed + ", keys);",
                        "})()"
                    ].join('\n'));
                }
            });

            var checkStr = condChecks.length > 0 ? condChecks.join(' && ') : 'true';

            jsCode += '        if (' + checkStr + ') {\n';
            evtBlock.actions.forEach(function (act) {
                var codeLiteral = (act.jsCode || '').replace(/`/g, '\\`').replace(/\$/g, '\\$');
                jsCode += "            executeAction('" + act.type + "', '" + act.targetId + "', '" + act.targetId2 + "', " + (act.speed || 0) + ", delta, `" + codeLiteral + "`);\n";
            });
            jsCode += '        }\n';
        }
    });

    jsCode += '        activeKeysPrev = {};\n';
    jsCode += '        Object.keys(keys).forEach(function (k) { activeKeysPrev[k] = keys[k]; });\n';
    jsCode += '    });\n';

    // Compile pointerdown click interaction raycasts
    var pointerEvents = App.events.filter(function (e) {
        return e.conditions.some(function (c) { return c.type === 'pointerdown'; });
    });
    
    if (pointerEvents.length > 0) {
        jsCode += '    scene.onPointerDown = function (evt, pickResult) {\n        if (pickResult.hit && pickResult.pickedMesh) {\n';
        pointerEvents.forEach(function (evtBlock) {
            var ptrConds = evtBlock.conditions.filter(function (c) { return c.type === 'pointerdown'; });
            ptrConds.forEach(function (pc) {
                jsCode += '            if (pickResult.pickedMesh === objects["' + pc.targetId + '"] || pickResult.pickedMesh.parent === objects["' + pc.targetId + '"]) {\n';
                evtBlock.actions.forEach(function (act) {
                    var codeLiteral = (act.jsCode || '').replace(/`/g, '\\`').replace(/\$/g, '\\$');
                    jsCode += "                executeAction('" + act.type + "', '" + act.targetId + "', '" + act.targetId2 + "', " + (act.speed || 0) + ", 1, `" + codeLiteral + "`);\n";
                });
                jsCode += '            }\n';
            });
        });
        jsCode += '        }\n    };\n';
    }

    jsCode += '    return scene;\n};\nvar scene = createScene();\nengine.runRenderLoop(function() { scene.render(); });\nwindow.addEventListener("resize", function() { engine.resize(); });\n';

    var htmlContent = [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '    <meta charset="UTF-8">',
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '    <title>WDevelop Exported Game</title>',
        '    <style>',
        '        body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #1e1e24; }',
        '        #renderCanvas { width: 100%; height: 100%; touch-action: none; outline: none; }',
        '    </style>',
        '    <script src="https://cdn.babylonjs.com/babylon.js"></script>',
        '    <script src="https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js"></script>',
        '    <script src="https://cdn.babylonjs.com/materialsLibrary/babylonjs.materials.min.js"></script>',
        '</head>',
        '<body>',
        '    <canvas id="renderCanvas"></canvas>',
        '    <script>',
        jsCode,
        '    </script>',
        '</body>',
        '</html>'
    ].join('\n');

    var blob = new Blob([htmlContent], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'game.html';
    link.click();
    URL.revokeObjectURL(url);
});
