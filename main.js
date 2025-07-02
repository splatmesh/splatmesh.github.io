import * as THREE from "three";
import { SparkRenderer, SplatMesh, PackedSplats, dyno } from "@sparkjsdev/spark";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import Stats from 'three/addons/libs/stats.module.js';

const $ = (s) => document.querySelector(s);
const canvas = $('canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.001, 1000);
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, preserveDrawingBuffer: true });

let splatMesh = null;

const animateT = dyno.dynoFloat(0);
const stats = new Stats();
stats.domElement.id = 'stats';
document.body.appendChild(stats.domElement);

const controls = new OrbitControls(camera, canvas);
controls.minDistance = 0;
controls.maxDistance = 10;
camera.position.set(0, 0, 2.5);

resizeCanvas();

renderer.setAnimationLoop((time) => {
    if (!controls.enabled || !splatMesh)
        return;

    animateT.value = time / 1000;
    splatMesh.updateVersion();
    resizeCanvas();
    controls.update();
    stats.update();
    renderer.render(scene, camera);
});

canvas.addEventListener('dblclick', (e) => {
    if (e.target == canvas)
        controls.enabled = !controls.enabled;
});

window.addEventListener('resize', () => {
    setTimeout(resizeCanvas, 150);
});

function resizeCanvas() {
    const w = window.innerWidth, h = window.innerHeight;

    if (w != canvas.width || h != canvas.height) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
}

let codemirror = null;

const getCodeMirrorText = () => codemirror &&
    dyno.unindent(codemirror.state.doc.toString()) ||
    decodeURIComponent(location.hash.replace(/^#/, '')) ||
    dyno.unindent($('#splat-glsl').textContent);

const objectModifier = dyno.dynoBlock(
    { gsplat: dyno.Gsplat },
    { gsplat: dyno.Gsplat },
    ({ gsplat }) => {
        const d = new dyno.Dyno({
            inTypes: { gsplat: dyno.Gsplat, time: "float" },
            outTypes: { gsplat: dyno.Gsplat },
            globals: () => [
                'float time = 0.;',
                'int numSplats = 0;',
                getCodeMirrorText(),
            ],
            statements: ({ inputs, outputs }) => dyno.unindentLines(`
                        time = ${inputs.time};
                        numSplats = ${splatMesh.numSplats};
                        ${outputs.gsplat} = ${inputs.gsplat};
                        mainSplat(${outputs.gsplat});
                    `),
        });
        gsplat = d.apply({ gsplat, time: animateT }).gsplat;
        return { gsplat };
    },
);

initSplatMesh(2048);

// Spark needs numSplats to be a multiple of 2048.
function initSplatMesh(numSplats) {
    scene.remove(splatMesh);
    const packedArray = new Uint32Array(numSplats * 4);
    // Spark drops splats of zero size
    // Alternative: gs.flags |= 1u;
    packedArray.fill(0x01010101);
    const packedSplats = new PackedSplats({ packedArray });
    splatMesh = new SplatMesh({ packedSplats });
    splatMesh.objectModifier = objectModifier;
    scene.add(splatMesh);
    console.log('Created SplatMesh:', splatMesh.numSplats, 'splats');
}

$('#logsplats').value = 0;
$('#logsplats').onchange = () => {
    let n = 2048 << $('#logsplats').value;
    $('#numsplats').textContent = n;
    initSplatMesh(n);
};

await initCodeMirror();

async function initCodeMirror() {
    const { basicSetup } = await import("codemirror");
    const { EditorView } = await import("@codemirror/view");
    const langGLSL = await import("codemirror-lang-glsl");
    const darkTheme = await import("codemirror-theme-one-dark");

    codemirror = new EditorView({
        parent: $('#codemirror code'),
        doc: getCodeMirrorText(),
        extensions: [
            basicSetup,
            langGLSL.glsl(),
            darkTheme.oneDark,
        ],
    });



    codemirror.dom.addEventListener('focusout', (e) => {
        console.log('Updating SplatMesh GLSL...');
        $('#webgl_error').style.display = 'none';
        controls.enabled = true;
        splatMesh.updateGenerator();
        let text = getCodeMirrorText();
        $('#share').href = '#' + encodeURIComponent(text);
        //deflateText(text); // DEBUG
    });

    async function deflateText(text) {
        await import('pako');
        let b64 = base64.encode(pako.deflate(text));
        let dec = pako.inflate(base64.decode(b64));
        let str = String.fromCharCode(...dec);
        let uri = encodeURIComponent(text);
        console.log('hash:', uri.length, uri);
        console.log('base64:', b64.length, b64);
    }

    //renderer.debug.onShaderError = ...
    const _console_error = console.error;
    console.error = (text, ...args) => {
        if (typeof text == 'string' && text.startsWith('THREE.WebGLProgram: Shader Error')) {
            let lines = text.split('\n')
                .filter(line => /^>?\s+\d+:/.test(line));
            $('#webgl_error div').textContent = lines.join('\n');
            $('#webgl_error').style.display = 'block';
            controls.enabled = false;
        }
        _console_error.call(console, text, ...args);
    };

    $('#hide').onclick = () => $('#codemirror').classList.toggle('collapsed', true);
    $('#show').onclick = () => $('#codemirror').classList.toggle('collapsed', false);
}
