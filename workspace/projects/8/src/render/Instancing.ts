/**
 * Instancing.ts
 * GPU instancing system for large-scale crowd rendering with LOD switching and frustum culling.
 * Optimized for 60 FPS with 300+ soldiers in Three.js.
 */

const InstancingSystem = {
    // Configuration
    MAX_INSTANCES: 1024,
    LOD_LEVELS: 3,
    LOD_DISTANCES: [50, 150, Infinity],
    BATCH_SIZE: 256,
    ENABLE_FX_CULLING: true,
    
    // Internal state
    instances: [],
    meshPrototypes: {},
    activeBatches: {},
    dirtyInstances: new Set(),
    frustumPlanes: [],
    lastUpdateTime: 0,
    updateInterval: 50, // ms between full cull updates
    
    /**
     * Initialize the instancing system
     * @param {THREE.WebGLRenderer} renderer - Three.js renderer
     * @param {THREE.Scene} scene - Scene to add instanced meshes to
     */
    init: function(renderer, scene) {
        this.renderer = renderer;
        this.scene = scene;
        
        // Pre-allocate instance storage
        this.instances = new Array(this.MAX_INSTANCES).fill(null);
        
        // Create batch containers for each LOD level
        for (let lod = 0; lod < this.LOD_LEVELS; lod++) {
            this.activeBatches[lod] = new Array(this.LOD_LEVELS);
            for (let batch = 0; batch < this.LOD_LEVELS; batch++) {
                this.activeBatches[lod][batch] = this.createBatchContainer(lod, batch);
            }
        }
        
        // Set up frustum culling utility
        this.frustumPlanes = new Array(6);
        this._lastUpdate = performance.now();
    },
    
    /**
     * Register a mesh prototype for instancing
     * @param {string} name - Unique identifier
     * @param {THREE.Mesh} mesh - Base mesh with geometry and material
     * @param {Array} lodMasks - Bitmask per LOD indicating which parts to render
     */
    registerPrototype: function(name, mesh, lodMasks = [0xFF, 0x0F, 0x01]) {
        const geometry = mesh.geometry;
        const material = mesh.material;
        
        // Create LOD variants with reduced detail if needed
        const lodMeshes = this.createLODVariants(geometry, material, lodMasks);
        
        this.meshPrototypes[name] = {
            name: name,
            baseMesh: mesh,
            lodMeshes: lodMeshes,
            lodMasks: lodMasks,
            vertexCount: geometry.attributes.position.count,
            partCount: lodMeshes.length
        };
    },
    
    /**
     * Create LOD variants with progressive simplification
     */
    createLODVariants: function(geometry, material, lodMasks) {
        return lodMasks.map((mask, lod) => {
            // For production, this would use actual decimated geometry
            // Here we clone and mark for potential simplification
            const lodGeometry = geometry.clone();
            const lodMaterial = material.clone();
            
            // Store LOD level and mask for shader use
            lodMaterial.defines = lodMaterial.defines || {};
            lodMaterial.defines.LOD_LEVEL = lod;
            lodMaterial.defines.LOD_MASK = mask;
            
            const lodMesh = new THREE.Mesh(lodGeometry, lodMaterial);
            lodMesh.frustumCulled = false; // Handled by our system
            return lodMesh;
        });
    },
    
    /**
     * Add an instance to the pool
     * @param {string} prototypeName - Registered prototype ID
     * @param {THREE.Matrix4} matrix - World transform
     * @param {Object} userData - Custom data (team, state, etc.)
     * @returns {number} Instance ID
     */
    addInstance: function(prototypeName, matrix, userData = {}) {
        // Find available slot
        for (let i = 0; i < this.MAX_INSTANCES; i++) {
            if (!this.instances[i] || this.instances[i].active === false) {
                this.instances[i] = {
                    id: i,
                    prototype: prototypeName,
                    matrix: matrix.clone(),
                    position: new THREE.Vector3().setFromMatrixPosition(matrix),
                    active: true,
                    visible: true,
                    currentLod: 0,
                    inFrustum: false,
                    lastSeen: 0,
                    userData: userData,
                    velocity: new THREE.Vector3(),
                    angularVelocity: new THREE.Vector3()
                };
                this.dirtyInstances.add(i);
                return i;
            }
        }
        
        console.warn("Instancing pool exhausted, consider increasing MAX_INSTANCES");
        return -1;
    },
    
    /**
     * Update instance transform
     */
    updateInstance: function(instanceId, matrix, userData = {}) {
        if (instanceId >= 0 && instanceId < this.MAX_INSTANCES && this.instances[instanceId]) {
            const instance = this.instances[instanceId];
            
            // Detect significant movement for LOD recalculation
            const newPosition = new THREE.Vector3().setFromMatrixPosition(matrix);
            if (newPosition.distanceToSquared(instance.position) > 0.25) {
                instance.position.copy(newPosition);
                instance.matrix.copy(matrix);
                this.dirtyInstances.add(instanceId);
            }
            
            if (Object.keys(userData).length > 0) {
                Object.assign(instance.userData, userData);
            }
        }
    },
    
    /**
     * Remove an instance
     */
    removeInstance: function(instanceId) {
        if (instanceId >= 0 && instanceId < this.MAX_INSTANCES) {
            this.instances[instanceId] = null;
            this.dirtyInstances.add(instanceId);
        }
    },
    
    /**
     * Main update call - should be called once per frame
     * @param {THREE.Camera} camera - Active camera
     * @param {Array} activeEntities - Entities to render
     */
    update: function(camera, activeEntities = []) {
        const now = performance.now();
        
        // Skip cull updates if too frequent
        if (now - this._lastUpdate < this.updateInterval && !this.dirtyInstances.size) {
            return;
        }
        
        this._lastUpdate = now;
        
        // 1. Update frustum planes
        this.updateFrustum(camera);
        
        // 2. Categorize instances by LOD and visibility
        const batchData = this.initializeBatchData();
        
        for (let i = 0; i < this.MAX_INSTANCES; i++) {
            const instance = this.instances[i];
            if (!instance || !instance.active) continue;
            
            // Frustum culling
            instance.inFrustum = this.isInFrustum(instance.position, instance.matrix);
            
            if (!instance.inFrustum) {
                instance.visible = false;
                continue;
            }
            
            // LOD selection
            instance.currentLod = this.selectLOD(camera.position, instance.position);
            instance.visible = true;
            
            // Assign to batch
            const lod = instance.currentLod;
            const proto = this.meshPrototypes[instance.prototype];
            if (proto) {
                this.assignToBatch(batchData, lod, i, instance, proto);
            }
        }
        
        this.dirtyInstances.clear();
        
        // 3. Update GPU buffers
        this.updateGPUBuffers(batchData);
        
        // 4. Toggle mesh visibility
        this.updateMeshVisibility(batchData);
    },
    
    /**
     * Calculate frustum planes from camera
     */
    updateFrustum: function(camera) {
        const frustum = new THREE.Frustum();
        const projectionMatrix = camera.projectionMatrix;
        const viewMatrix = camera.matrixWorldInverse;
        
        const m = new THREE.Matrix4();
        m.multiplyMatrices(projectionMatrix, viewMatrix);
        frustum.setFromProjectionMatrix(m);
        
        this.frustumPlanes = [
            frustum.planes[0],
            frustum.planes[1],
            frustum.planes[2],
            frustum.planes[3],
            frustum.planes[4],
            frustum.planes[5]
        ];
    },
    
    /**
     * Test if a world-space point is inside the frustum
     */
    isInFrustum: function(position, matrix) {
        if (!this.ENABLE_FX_CULLING) return true;
        
        // Quick sphere test against frustum
        const radius = 3.0; // Assume soldier bounding sphere
        const pos = position;
        
        for (let i = 0; i < 6; i++) {
            const plane = this.frustumPlanes[i];
            const dist = plane.normal.dot(pos) + plane.constant;
            
            if (dist < -radius) {
                return false;
            }
        }
        
        return true;
    },
    
    /**
     * Select appropriate LOD level based on distance
     */
    selectLOD: function(cameraPos, instancePos) {
        const dist = cameraPos.distanceTo(instancePos);
        
        for (let i = 0; i < this.LOD_LEVELS; i++) {
            if (dist < this.LOD_DISTANCES[i]) {
                return i;
            }
        }
        return this.LOD_LEVELS - 1;
    },
    
    /**
     * Initialize per-frame batch data structure
     */
    initializeBatchData: function() {
        const data = {
            lodBatches: {},
            matrixArrays: {},
            countPerBatch: {}
        };
        
        for (let lod = 0; lod < this.LOD_LEVELS; lod++) {
            data.lodBatches[lod] = [];
            data.countPerBatch[lod] = 0;
            
            for (let b = 0; b < this.LOD_LEVELS; b++) {
                data.matrixArrays[`${lod}_${b}`] = new Float32Array(this.BATCH_SIZE * 16);
                data.lodBatches[lod].push({
                    index: 0,
                    batchIndex: b,
                    count: 0,
                    instanceIds: []
                });
            }
        }
        
        return data;
    },
    
    /**
     * Assign an instance to an appropriate batch
     */
    assignToBatch: function(batchData, lod, instanceId, instance, proto) {
        const key = `${lod}_${instanceId % this.LOD_LEVELS}`;
        const batches = batchData.lodBatches[lod];
        const targetBatch = batches[instanceId % this.LOD_LEVELS];
        const arrayKey = key;
        
        if (targetBatch.count < this.BATCH_SIZE) {
            const offset = targetBatch.index * 16;
            const matrixArray = batchData.matrixArrays[arrayKey];
            
            instance.matrix.toArray(matrixArray, offset);
            
            targetBatch.instanceIds.push(instanceId);
            targetBatch.index++;
            targetBatch.count++;
            
            batchData.countPerBatch[lod]++;
        }
    },
    
    /**
     * Push updated data to GPU
     */
    updateGPUBuffers: function(batchData) {
        for (let lod = 0; lod < this.LOD_LEVELS; lod++) {
            for (let b = 0; b < this.LOD_LEVELS; b++) {
                const container = this.activeBatches[lod][b];
                const matrixArray = batchData.matrixArrays[`${lod}_${b}`];
                
                // Only update if container exists and has data
                if (container && container.mesh && batchData.lodBatches[lod][b].count > 0) {
                    this.uploadInstanceData(container, matrixArray, batchData.lodBatches[lod][b]);
                }
            }
        }
    },
    
    /**
     * Upload instance data to GPU mesh
     */
    uploadInstanceData: function(container, matrixData, batchInfo) {
        const mesh = container.mesh;
        if (!mesh) return;
        
        // Check if we're using InstancedMesh (modern Three.js)
        if (mesh.isInstancedMesh) {
            const instanceCount = Math.min(batchInfo.count, mesh.count);
            
            for (let i = 0; i < instanceCount; i++) {
                const mat = new THREE.Matrix4().fromArray(matrixData, i * 16);
                mesh.setMatrixAt(i, mat);
            }
            
            mesh.count = instanceCount;
            mesh.instanceMatrix.needsUpdate = true;
            
            // Update custom attributes if needed
            if (mesh.instanceMatrix) {
                mesh.instanceMatrix.needsUpdate = true;
            }
        }
        // Legacy shader-based instancing
        else if (container.customUniforms && container.customUniforms.uInstances) {
            container.customUniforms.uInstances.value = matrixData;
            container.customUniforms.uInstanceCount.value = batchInfo.count;
        }
    },
    
    /**
     * Toggle visibility of batch containers
     */
    updateMeshVisibility: function(batchData) {
        for (let lod = 0; lod < this.LOD_LEVELS; lod++) {
            for (let b = 0; b < this.LOD_LEVELS; b++) {
                const container = this.activeBatches[lod][b];
                if (!container) continue;
                
                const hasInstances = batchData.lodBatches[lod][b].count > 0;
                
                if (container.mesh) {
                    container.mesh.visible = hasInstances;
                }
            }
        }
    },
    
    /**
     * Create a batch container for LOD/mesh group
     */
    createBatchContainer: function(lod, batchIndex) {
        const container = {
            lod: lod,
            batchIndex: batchIndex,
            mesh: null,
            customUniforms: null,
            geometry: null,
            material: null
        };
        
        // This gets populated when prototypes are registered
        return container;
    },
    
    /**
     * Link a prototype to its batch containers
     */
    linkPrototypeToBatches: function(prototypeName) {
        const proto = this.meshPrototypes[prototypeName];
        if (!proto) return;
        
        for (let lod = 0; lod < this.LOD_LEVELS; lod++) {
            for (let b = 0; b < this.LOD_LEVELS; b++) {
                const container = this.activeBatches[lod][b];
                const key = `${prototypeName}_${lod}_${b}`;
                
                if (!container.prototypes) {
                    container.prototypes = {};
                }
                
                const meshProto = proto.lodMeshes[lod];
                
                // Clone for this specific batch to allow per-batch state
                const batchMesh = meshProto.clone();
                batchMesh.name = key;
                batchMesh.visible = false;
                
                this.scene.add(batchMesh);
                
                // For InstancedMesh approach
                if (meshProto.geometry) {
                    const instancedMesh = new THREE.InstancedMesh(
                        meshProto.geometry,
                        meshProto.material,
                        this.BATCH_SIZE
                    );
                    instancedMesh.name = key;
                    instancedMesh.visible = false;
                    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                    
                    this.scene.add(instancedMesh);
                    
                    container.mesh = instancedMesh;
                    container.originalMesh = meshProto;
                }
            }
        }
    },
    
    /**
     * Force a complete rebuild (use after major changes)
     */
    rebuild: function() {
        this.dispose();
        this.init(this.renderer, this.scene);
        
        for (const name in this.meshPrototypes) {
            this.linkPrototypeToBatches(name);
        }
    },
    
    /**
     * Cleanup GPU resources
     */
    dispose: function() {
        for (let lod = 0; lod < this.LOD_LEVELS; lod++) {
            for (let b = 0; b < this.LOD_LEVELS; b++) {
                const container = this.activeBatches[lod][b];
                if (container) {
                    if (container.mesh) {
                        this.scene.remove(container.mesh);
                        if (container.mesh.geometry) container.mesh.geometry.dispose();
                        if (container.mesh.material) {
                            if (Array.isArray(container.mesh.material)) {
                                container.mesh.material.forEach(m => m.dispose());
                            } else {
                                container.mesh.material.dispose();
                            }
                        }
                    }
                }
            }
        }
        
        this.instances = [];
        this.dirtyInstances.clear();
        this.activeBatches = {};
    },
    
    /**
     * Get statistics for debugging
     */
    getStats: function() {
        let totalActive = 0;
        let totalInFrustum = 0;
        const perLod = new Array(this.LOD_LEVELS).fill(0);
        
        for (let i = 0; i < this.MAX_INSTANCES; i++) {
            if (this.instances[i] && this.instances[i].active) {
                totalActive++;
                if (this.instances[i].inFrustum) {
                    totalInFrustum++;
                    perLod[this.instances[i].currentLod]++;
                }
            }
        }
        
        return {
            totalActive,
            totalInFrustum,
            perLod,
            poolSize: this.MAX_INSTANCES
        };
    }
};

// Export for module usage
export default InstancingSystem;
