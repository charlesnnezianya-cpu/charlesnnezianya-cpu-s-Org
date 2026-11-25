import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  createBrainstineSceneObjects,
  updateBrainstineAnimation,
} from './brainGeometry';
import { BrainFallbackVisual } from './BrainFallbackVisual';

export type BrainStagePhase = 'intro' | 'transitioning' | 'hero';

interface BrainstineBrainCanvasProps {
  phase: BrainStagePhase;
  className?: string;
  interactive?: boolean;
  onCanvasReady?: () => void;
}

function detectSoftwareWebGl(): { supported: boolean; isSoftwareGl: boolean } {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) {
      return { supported: false, isSoftwareGl: false };
    }
    const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererString = debugExt
      ? String(gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) || '')
      : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(
      rendererString
    );
    return { supported: true, isSoftwareGl };
  } catch {
    return { supported: false, isSoftwareGl: false };
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function easeInOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export default function BrainstineBrainCanvas({
  phase,
  className = '',
  interactive = true,
  onCanvasReady,
}: BrainstineBrainCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef<BrainStagePhase>(phase);
  const interactiveRef = useRef<boolean>(interactive);
  const onReadyRef = useRef<(() => void) | undefined>(onCanvasReady);
  const [fallbackActive, setFallbackActive] = useState<boolean>(() =>
    prefersReducedMotion()
  );

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    interactiveRef.current = interactive;
  }, [interactive]);

  useEffect(() => {
    onReadyRef.current = onCanvasReady;
  }, [onCanvasReady]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const handleChange = () => {
      if (media.matches) setFallbackActive(true);
    };
    media.addEventListener?.('change', handleChange);
    return () => media.removeEventListener?.('change', handleChange);
  }, []);

  useEffect(() => {
    if (fallbackActive) return;
    const container = containerRef.current;
    if (!container) return;

    const { supported, isSoftwareGl } = detectSoftwareWebGl();
    if (!supported) {
      setFallbackActive(true);
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setFallbackActive(true);
      return;
    }

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;

    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'pan-y';
    container.innerHTML = '';
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050914, 0.045);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 45);
    camera.position.set(-1.1, 0.35, 2.2);

    // Studio Neuroscience Lighting Rig provides sufficient illumination
    scene.environment = null;

    // Cinematic Studio Neuroscience Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x050914, 0.65);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xeef6ff, 2.65);
    keyLight.position.set(3.2, 4.4, 4.2);
    scene.add(keyLight);

    const rimLightCyan = new THREE.DirectionalLight(0x38bdf8, 2.25);
    rimLightCyan.position.set(-4.2, 2.0, -3.2);
    scene.add(rimLightCyan);

    const fillPointViolet = new THREE.PointLight(0x8b5cf6, 3.6, 14, 1.4);
    fillPointViolet.position.set(3.0, -2.0, -2.2);
    scene.add(fillPointViolet);

    const crownGlow = new THREE.PointLight(0x38bdf8, 2.4, 10, 1.5);
    crownGlow.position.set(-1.2, 2.8, 2.2);
    scene.add(crownGlow);

    const sceneObjects = createBrainstineSceneObjects(isSoftwareGl);
    sceneObjects.root.scale.setScalar(phaseRef.current === 'hero' ? 1.04 : 1.12);
    scene.add(sceneObjects.root);

    // Pointer parallax & drag state
    const pointer = { x: 0, y: 0, dragOffsetY: 0 };
    let isDragging = false;
    let dragStartX = 0;
    let dragBaseOffset = 0;

    const handlePointerMove = (e: PointerEvent) => {
      if (!interactiveRef.current) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      pointer.x = THREE.MathUtils.clamp(nx, -1, 1);
      pointer.y = THREE.MathUtils.clamp(ny, -1, 1);

      if (isDragging) {
        const dx = (e.clientX - dragStartX) / Math.max(rect.width, 1);
        pointer.dragOffsetY = dragBaseOffset + dx * 2.5;
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (!interactiveRef.current || phaseRef.current !== 'hero') return;
      isDragging = true;
      dragStartX = e.clientX;
      dragBaseOffset = pointer.dragOffsetY;
    };

    const handlePointerUp = () => {
      isDragging = false;
    };

    const handlePointerLeave = () => {
      isDragging = false;
      pointer.x = 0;
      pointer.y = 0;
    };

    canvas.addEventListener('pointermove', handlePointerMove, { passive: true });
    canvas.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', handlePointerUp, { passive: true });
    canvas.addEventListener('pointerleave', handlePointerLeave, { passive: true });

    let currentAspect = width / height;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(entry.contentRect.width, 1);
        const h = Math.max(entry.contentRect.height, 1);
        currentAspect = w / h;
        camera.aspect = currentAspect;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      }
    });
    resizeObserver.observe(container);

    let contextLost = false;
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      setFallbackActive(true);
    };
    const handleContextRestored = () => {
      contextLost = false;
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    const gl = renderer.getContext();
    const afterDraw = (cb: () => void) => {
      if (!isSoftwareGl) {
        requestAnimationFrame(cb);
        return;
      }
      if (gl instanceof WebGL2RenderingContext) {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) {
          gl.flush();
          const check = () => {
            if (disposed) return;
            const status = gl.clientWaitSync(sync, 0, 0);
            if (status === gl.WAIT_FAILED || status === gl.TIMEOUT_EXPIRED) {
              setTimeout(check, 16);
              return;
            }
            gl.deleteSync(sync);
            setTimeout(() => {
              if (!disposed) requestAnimationFrame(cb);
            }, 64);
          };
          setTimeout(check, 16);
          return;
        }
      }
      setTimeout(() => {
        if (!disposed) requestAnimationFrame(cb);
      }, 80);
    };

    let disposed = false;
    let hidden = document.hidden;
    const handleVisibility = () => {
      hidden = document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibility);

    let lastNow = performance.now();
    let elapsed = 0;
    let signaledReady = false;
    const lookTarget = new THREE.Vector3(0.08, 0.06, 0.12);
    const desiredLookTarget = new THREE.Vector3();

    const tick = () => {
      if (disposed || contextLost) return;
      const now = performance.now();
      const rawDelta = (now - lastNow) / 1000;
      lastNow = now;

      if (hidden) {
        afterDraw(tick);
        return;
      }

      const delta = Math.min(rawDelta, 0.05);
      elapsed += delta;

      const currentPhase = phaseRef.current;
      // Keep full brain neatly framed even on narrow portrait mobile containers
      const portraitDistanceBoost = currentAspect < 0.85 ? 0.75 : currentAspect < 1.05 ? 0.3 : 0;

      if (currentPhase === 'intro' || currentPhase === 'transitioning') {
        // Dramatic close-up over cortical folds (0s–1.1s) -> majestic pull-back & orbit (1.1s–3.6s)
        const pullProgress = easeInOutCubic((elapsed - 0.55) / 2.75);
        const orbitAngle = THREE.MathUtils.lerp(-0.58, 0.24, pullProgress) + elapsed * 0.04;
        const radius =
          THREE.MathUtils.lerp(2.45, currentPhase === 'transitioning' ? 4.35 : 3.95, pullProgress) +
          portraitDistanceBoost;
        const camY = THREE.MathUtils.lerp(0.38, 0.24, pullProgress);

        const targetX = Math.sin(orbitAngle) * radius;
        const targetZ = Math.cos(orbitAngle) * radius;

        camera.position.x = THREE.MathUtils.damp(camera.position.x, targetX, 3.2, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, camY, 3.2, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, targetZ, 3.2, delta);

        // Shift focal point subtly downward once pulled back so the brain sits above the lower-third brand reveal
        desiredLookTarget.set(
          THREE.MathUtils.lerp(0.12, 0, pullProgress),
          THREE.MathUtils.lerp(0.14, -0.22, pullProgress),
          THREE.MathUtils.lerp(0.18, 0, pullProgress)
        );
        lookTarget.lerp(desiredLookTarget, 1 - Math.exp(-3.4 * delta));
        camera.lookAt(lookTarget);

        const targetScale = currentPhase === 'transitioning' ? 1.04 : 1.14;
        const nextScale = THREE.MathUtils.damp(
          sceneObjects.root.scale.x,
          targetScale,
          3.0,
          delta
        );
        sceneObjects.root.scale.setScalar(nextScale);
      } else {
        // Hero mode: large monumental framing with gentle idle camera drift + pointer/drag responsiveness
        const idleCamX = Math.sin(elapsed * 0.35) * 0.22;
        const heroZ = 3.55 + portraitDistanceBoost;

        camera.position.x = THREE.MathUtils.damp(camera.position.x, idleCamX, 2.5, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, 0.16, 2.5, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, heroZ, 2.5, delta);

        desiredLookTarget.set(0, -0.04, 0);
        lookTarget.lerp(desiredLookTarget, 1 - Math.exp(-3.0 * delta));
        camera.lookAt(lookTarget);

        const nextScale = THREE.MathUtils.damp(sceneObjects.root.scale.x, 1.08, 3.0, delta);
        sceneObjects.root.scale.setScalar(nextScale);
      }

      updateBrainstineAnimation(sceneObjects, elapsed, delta, currentPhase, pointer);

      renderer.render(scene, camera);

      if (!signaledReady) {
        signaledReady = true;
        onReadyRef.current?.();
      }

      afterDraw(tick);
    };

    requestAnimationFrame(tick);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      resizeObserver.disconnect();

      sceneObjects.dispose();
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, [fallbackActive]);

  if (fallbackActive) {
    return <BrainFallbackVisual className={className} />;
  }

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full select-none ${className}`}
      aria-hidden="true"
    />
  );
}
