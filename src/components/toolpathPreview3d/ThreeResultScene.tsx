import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { MaterialRemovalPreview } from '../../utils/materialRemovalPreview';
import { buildMaterialRemovalMesh } from '../../utils/materialRemovalMesh';
import type {
  ToolpathPreview3D,
  ToolpathPreview3DSegmentKind,
} from '../../utils/toolpathPreview3d';
import { buildThreeResultGeometryData } from './threeResultGeometry';

interface ThreeResultSceneProps {
  materialRemoval: MaterialRemovalPreview;
  preview: ToolpathPreview3D;
  showToolpaths: boolean;
  onUnavailable: () => void;
}

const TOOLPATH_COLORS: Record<ToolpathPreview3DSegmentKind, number> = {
  rapid: 0x7dd3fc,
  plunge: 0xf59e0b,
  cut: 0x22c55e,
};

function addToolpathLines(
  scene: THREE.Scene,
  preview: ToolpathPreview3D
): void {
  (Object.keys(TOOLPATH_COLORS) as ToolpathPreview3DSegmentKind[]).forEach(
    (kind) => {
      const positions: number[] = [];
      preview.segments
        .filter((segment) => segment.kind === kind)
        .forEach((segment) => {
          for (let index = 1; index < segment.points.length; index += 1) {
            const start = segment.points[index - 1];
            const end = segment.points[index];
            positions.push(
              start.x,
              start.y,
              start.z,
              end.x,
              end.y,
              end.z
            );
          }
        });

      if (positions.length === 0) {
        return;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3)
      );
      const material = new THREE.LineBasicMaterial({
        color: TOOLPATH_COLORS[kind],
        depthTest: false,
        transparent: kind === 'rapid',
        opacity: kind === 'rapid' ? 0.8 : 1,
      });
      const lines = new THREE.LineSegments(geometry, material);
      lines.renderOrder = 10;
      lines.userData.disposable = true;
      scene.add(lines);
    }
  );
}

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) {
      return;
    }
    object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    materials.forEach((material) => material.dispose());
  });
}

export default function ThreeResultScene({
  materialRemoval,
  preview,
  showToolpaths,
  onUnavailable,
}: ThreeResultSceneProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      onUnavailable();
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x08111f, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'preview3d-canvas preview3d-webgl-canvas';
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute(
      'aria-label',
      '3D material removal preview'
    );
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const width = materialRemoval.width;
    const height = materialRemoval.height;
    const depth = materialRemoval.stockThickness;
    const center = new THREE.Vector3(width / 2, height / 2, -depth / 2);
    const radius = Math.max(1, Math.hypot(width, height, depth) / 2);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, radius * 20);
    camera.up.set(0, 0, 1);
    camera.position.set(
      center.x + radius * 1.15,
      center.y - radius * 1.4,
      center.z + radius * 1.05
    );
    camera.lookAt(center);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.minZoom = 0.25;
    controls.maxZoom = 20;
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 1.45));
    const keyLight = new THREE.DirectionalLight(0xfff3df, 2.25);
    keyLight.position.set(
      center.x - radius,
      center.y - radius * 1.2,
      center.z + radius * 2
    );
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x9ecbff, 0.65);
    fillLight.position.set(
      center.x + radius,
      center.y + radius,
      center.z + radius * 0.5
    );
    scene.add(fillLight);

    const meshData = buildThreeResultGeometryData(
      buildMaterialRemovalMesh(materialRemoval)
    );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(meshData.positions, 3)
    );
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(meshData.normals, 3)
    );
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(meshData.colors, 3)
    );
    geometry.computeBoundingSphere();

    const stockMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0,
      flatShading: true,
      side: THREE.DoubleSide,
      polygonOffset: showToolpaths,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const stock = new THREE.Mesh(geometry, stockMaterial);
    scene.add(stock);

    if (showToolpaths) {
      addToolpathLines(scene, preview);
    }

    const render = (): void => {
      renderer.render(scene, camera);
    };

    const resize = (): void => {
      const nextWidth = Math.max(1, host.clientWidth);
      const nextHeight = Math.max(1, host.clientHeight);
      const aspect = nextWidth / nextHeight;
      const halfHeight = radius * 1.15;
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight, false);
      render();
    };

    controls.addEventListener('change', render);
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(resize);
    resizeObserver?.observe(host);
    if (!resizeObserver) {
      window.addEventListener('resize', resize);
    }
    resize();

    const handleContextLost = (event: Event): void => {
      event.preventDefault();
      onUnavailable();
    };
    renderer.domElement.addEventListener(
      'webglcontextlost',
      handleContextLost
    );

    return () => {
      renderer.domElement.removeEventListener(
        'webglcontextlost',
        handleContextLost
      );
      controls.removeEventListener('change', render);
      controls.dispose();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      disposeScene(scene);
      renderer.dispose();
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [
    materialRemoval,
    onUnavailable,
    preview,
    showToolpaths,
  ]);

  return (
    <div
      ref={hostRef}
      className="preview3d-webgl-host"
      data-testid="three-result-scene"
    />
  );
}
