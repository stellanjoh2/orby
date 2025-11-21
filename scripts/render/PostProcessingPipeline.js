import * as THREE from 'three';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/FilmPass.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/shaders/FXAAShader.js';
import {
  BloomTintShader,
  GrainTintShader,
  AberrationShader,
  ExposureShader,
  ToneMappingShader,
  LensDirtShader,
} from '../shaders/index.js';
import { ColorAdjustController } from './ColorAdjustController.js';

export class PostProcessingPipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = new THREE.Vector2();
    this.renderer.getSize(size);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.renderPass.clearAlpha = 0;

    this.bokehPass = new BokehPass(scene, camera, {
      focus: 10,
      aperture: 0.003,
      maxblur: 0.01,
    });

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      1.2,
      0.35,
      0.85,
    );

    this.filmPass = new FilmPass(0.0, 0.0, 648, false);
    this.bloomTintPass = new ShaderPass(BloomTintShader);
    this.grainTintPass = new ShaderPass(GrainTintShader);
    this.grainTintPass.uniforms.time.value = 0;

    this.lensDirtPass = new ShaderPass(LensDirtShader);
    this.lensDirtPass.enabled = false;

    this.aberrationPass = new ShaderPass(AberrationShader);
    this.exposurePass = new ShaderPass(ExposureShader);

    this.fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = this.renderer.getPixelRatio();
    this.fxaaPass.material.uniforms.resolution.value.x = 1 / (size.x * pixelRatio);
    this.fxaaPass.material.uniforms.resolution.value.y = 1 / (size.y * pixelRatio);
    this.fxaaPass.enabled = false;

    this.aberrationPass.renderToScreen = false;
    this.fxaaPass.renderToScreen = false;
    this.exposurePass.renderToScreen = false;

    this.colorAdjust = new ColorAdjustController();
    this.colorAdjustPass = this.colorAdjust.getPass();

    this.toneMappingPass = new ShaderPass(ToneMappingShader);
    this.toneMappingPass.renderToScreen = true;

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bokehPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.bloomTintPass);
    this.composer.addPass(this.lensDirtPass);
    this.composer.addPass(this.filmPass);
    this.composer.addPass(this.grainTintPass);
    this.composer.addPass(this.aberrationPass);
    this.composer.addPass(this.fxaaPass);
    this.composer.addPass(this.exposurePass);
    this.composer.addPass(this.colorAdjustPass);
    this.composer.addPass(this.toneMappingPass);
  }
}

