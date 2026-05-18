/*
 *  WDevelop — Babylon.js Engine Bootstrap
 *  ---------------------------------------
 *  Pure rendering setup. No UI stuff here — that's in settings.js and ui.js.
 *  If you're looking for the post-processing sliders, check settings.js.
 */

(function () {

    var canvas = document.getElementById("renderCanvas");
    var engine = new BABYLON.Engine(canvas, true);

    // stash references so other files can use them
    App.canvas = canvas;
    App.engine = engine;

    function buildScene() {
        var scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color4(0.12, 0.12, 0.14, 1);

        // -- camera (orbit style for the editor) --
        var cam = new BABYLON.ArcRotateCamera("editorCam", -Math.PI / 4, Math.PI / 3, 15, BABYLON.Vector3.Zero(), scene);
        cam.attachControl(canvas, true);
        cam.wheelPrecision = 50;
        App.editorCamera = cam;

        // -- environment map for realistic PBR reflections --
        // this .dds is from the babylon playground, not ideal for production
        // but it works offline and looks decent enough
        var envTex = BABYLON.CubeTexture.CreateFromPrefilteredData(
            "https://playground.babylonjs.com/textures/environment.dds", scene
        );
        scene.environmentTexture = envTex;

        // -- directional "sun" light --
        var sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-1, -2, -1), scene);
        sun.position = new BABYLON.Vector3(20, 40, 20);
        sun.intensity = 1.5;

        // ambient fill so shadows don't go pure black
        var fill = new BABYLON.HemisphericLight("fill", new BABYLON.Vector3(0, 1, 0), scene);
        fill.intensity = 0.3;

        // -- shadow generator (attached to the sun) --
        var shadows = new BABYLON.ShadowGenerator(1024, sun);
        shadows.useBlurExponentialShadowMap = true;
        shadows.blurKernel = 32;
        App.shadowGenerator = shadows;

        // -- ground plane --
        var ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, scene);
        var groundMat = new BABYLON.PBRMaterial("groundMat", scene);
        groundMat.albedoColor = new BABYLON.Color3(0.3, 0.3, 0.3);
        groundMat.metallic = 0.1;
        groundMat.roughness = 0.8;
        ground.material = groundMat;
        ground.receiveShadows = true;
        ground.isPickable = false;

        // -- transform gizmos --
        var gizmos = new BABYLON.GizmoManager(scene);
        gizmos.attachableMeshes = null;
        gizmos.usePointerToAttach = false;
        App.gizmoManager = gizmos;

        // -- post-processing --
        var pipeline = new BABYLON.DefaultRenderingPipeline("default", true, scene, [cam]);
        pipeline.samples = 4;
        pipeline.bloomEnabled = false;
        pipeline.bloomThreshold = 0.8;
        pipeline.bloomWeight = 0.5;
        scene.imageProcessingConfiguration.exposure = 1.0;
        App.renderPipeline = pipeline;

        // -- keyboard tracking --
        // we just flip flags on/off, the game loop reads them
        scene.onKeyboardObservable.add(function (info) {
            var key = info.event.key.toLowerCase();
            if (info.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
                App.keys[key] = true;
            } else if (info.type === BABYLON.KeyboardEventTypes.KEYUP) {
                App.keys[key] = false;
            }
        });

        return scene;
    }

    var scene = buildScene();
    App.scene = scene;

    // main render loop — keep it clean, no logic here
    engine.runRenderLoop(function () {
        scene.render();
    });

    window.addEventListener("resize", function () {
        engine.resize();
    });

    /*
     *  Sync the property panel inputs when the user drags a gizmo.
     *  Called from ui.js when switching tools.
     */
    window.syncPropertiesFromMesh = function () {
        if (!App.selectedObjectId || App.isPlaying) return;

        var obj = findObject(App.selectedObjectId);
        if (!obj || !obj.mesh) return;

        // helper: poke a value into an input without stealing focus
        var poke = function (prop, axis, val) {
            var el = document.querySelector('input[data-prop="' + prop + '"][data-axis="' + axis + '"]');
            if (el && document.activeElement !== el) {
                el.value = val.toFixed(2);
            }
        };

        poke('position', 'x', obj.mesh.position.x);
        poke('position', 'y', obj.mesh.position.y);
        poke('position', 'z', obj.mesh.position.z);

        poke('rotation', 'x', BABYLON.Tools.ToDegrees(obj.mesh.rotation.x));
        poke('rotation', 'y', BABYLON.Tools.ToDegrees(obj.mesh.rotation.y));
        poke('rotation', 'z', BABYLON.Tools.ToDegrees(obj.mesh.rotation.z));

        poke('scaling', 'x', obj.mesh.scaling.x);
        poke('scaling', 'y', obj.mesh.scaling.y);
        poke('scaling', 'z', obj.mesh.scaling.z);
    };

})();
