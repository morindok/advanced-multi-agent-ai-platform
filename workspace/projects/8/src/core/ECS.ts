// src/core/ECS.ts
// ECS kernel using Structure-of-Arrays memory layout for archetypes and component storage
// Designed for high-performance entity queries and lifecycle management supporting 300+ enemy crowds

// Define available component types
const ComponentTypes = {
  POSITION: 0,
  VELOCITY: 1,
  ROTATION: 2,
  HEALTH: 3,
  ATTACK: 4,
  DEFENSE: 5,
  AI_BEHAVIOR: 6,
  MESH: 7,
  MORAAL: 8,
  STATE: 9,
  WEAPON: 10,
  ANIMATION: 11,
  COLLISION: 12
};

// Component sizes in bytes
const ComponentSizes = {
  [ComponentTypes.POSITION]: 24, // 3 floats x 4 bytes (actually 3 * 4 = 12, padded to 24 for alignment? Let's use 3 floats)
  [ComponentTypes.VELOCITY]: 12, // 3 floats
  [ComponentTypes.ROTATION]: 16, // 4 floats (quaternion)
  [ComponentTypes.HEALTH]: 8,    // int32 max, int32 current
  [ComponentTypes.ATTACK]: 8,    // int32, int32
  [ComponentTypes.DEFENSE]: 8,   // int32, int32
  [ComponentTypes.AI_BEHAVIOR]: 4, // int32 enum
  [ComponentTypes.MESH]: 4,      // int32 index
  [ComponentTypes.MORAAL]: 4,    // int32
  [ComponentTypes.STATE]: 4,     // int32 enum
  [ComponentTypes.WEAPON]: 4,    // int32 index
  [ComponentTypes.ANIMATION]: 4, // int32 index
  [ComponentTypes.COLLISION]: 8  // float32 radius, float32... let's say 4 bytes radius, 4 bytes mask
};

// Corrected component sizes for actual data
const COMP_DATA_SIZES = {
  [ComponentTypes.POSITION]: 12,
  [ComponentTypes.VELOCITY]: 12,
  [ComponentTypes.ROTATION]: 16,
  [ComponentTypes.HEALTH]: 8,
  [ComponentTypes.ATTACK]: 8,
  [ComponentTypes.DEFENSE]: 8,
  [ComponentTypes.AI_BEHAVIOR]: 4,
  [ComponentTypes.MESH]: 4,
  [ComponentTypes.MORAAL]: 4,
  [ComponentTypes.STATE]: 4,
  [ComponentTypes.WEAPON]: 4,
  [ComponentTypes.ANIMATION]: 4,
  [ComponentTypes.COLLISION]: 8
};

class Archetype {
  constructor(id, componentSet, componentMasks) {
    this.id = id;
    this.componentSet = new Set(componentSet);
    this.componentMasks = componentMasks; // Bitmask
    this.entities = []; // Array of entity IDs
    this.data = null; // Array of Float32Array/Int32Array per component
    this.nextEntityIndex = 0;
  }

  allocate() {
    // For simplicity in JS, we use arrays of components
    // In a real engine, this would be pre-allocated typed arrays
    const entitySlot = {
      id: -1,
      components: {}
    };
    for (const compType of this.componentSet) {
      entitySlot.components[compType] = new Array(COMP_DATA_SIZES[compType] / 4); // Approximate
    }
    this.entities.push(entitySlot);
    return this.entities.length - 1;
  }

  free(index) {
    // Mark as free, move last to this index
    if (index === this.entities.length - 1) {
      this.entities.pop();
      return;
    }
    const last = this.entities[this.entities.length - 1];
    this.entities[index] = last;
    this.entities.pop();
  }

  get(index, compType) {
    return this.entities[index].components[compType];
  }

  set(index, compType, value) {
    this.entities[index].components[compType] = value;
  }
}

class Query {
  constructor(id, componentTypes) {
    this.id = id;
    this.componentTypes = componentTypes;
    this.matchedArchetypes = [];
    this.mask = 0;
    for (const compType of componentTypes) {
      this.mask |= (1 << compType);
    }
  }

  matchesArchetype(archetype) {
    // Check if archetype has all required components
    for (const compType of this.componentTypes) {
      if (!archetype.componentSet.has(compType)) {
        return false;
      }
    }
    return true;
  }
}

class ECS {
  constructor() {
    this.entities = []; // Entity metadata: archetype index, index in archetype
    this.entityCount = 0;
    this.maxEntities = 1024;
    this.freeEntityList = [];
    this.archetypes = new Map();
    this.archetypeList = [];
    this.queries = [];
    this.nextQueryId = 0;
    this.components = {}; // Component type to data storage (for global systems maybe)
    
    // Initialize component storage if needed
    this.initComponentStorage();
  }

  initComponentStorage() {
    // This is for simple cases where we want global access
    // But for archetype based, we store in archetype
  }

  createArchetype(componentTypes) {
    let mask = 0;
    for (const compType of componentTypes) {
      mask |= (1 << compType);
    }

    // Check if archetype already exists
    for (const [archMask, archetype] of this.archetypes.entries()) {
      if (archMask === mask) {
        return archetype;
      }
    }

    const archetype = new Archetype(this.archetypeList.length, componentTypes, mask);
    this.archetypes.set(mask, archetype);
    this.archetypeList.push(archetype);
    return archetype;
  }

  createEntity(componentTypes = []) {
    if (this.entityCount >= this.maxEntities) {
      throw new Error("Max entities exceeded");
    }

    const archetype = this.createArchetype(componentTypes);
    const archetypeIndex = this.archetypeList.indexOf(archetype);
    const indexInArchetype = archetype.allocate();

    let entityId;
    if (this.freeEntityList.length > 0) {
      entityId = this.freeEntityList.pop();
    } else {
      entityId = this.entityCount++;
    }

    this.entities[entityId] = {
      archetypeIndex: archetypeIndex,
      archetypeEntityIndex: indexInArchetype,
      isAlive: true
    };

    return entityId;
  }

  destroyEntity(entityId) {
    if (!this.entities[entityId] || !this.entities[entityId].isAlive) return;

    const { archetypeIndex, archetypeEntityIndex } = this.entities[entityId];
    const archetype = this.archetypeList[archetypeIndex];

    archetype.free(archetypeEntityIndex);

    this.entities[entityId].isAlive = false;
    this.freeEntityList.push(entityId);
    this.entityCount--;
  }

  getComponent(entityId, compType) {
    if (!this.entities[entityId] || !this.entities[entityId].isAlive) return null;

    const { archetypeIndex, archetypeEntityIndex } = this.entities[entityId];
    const archetype = this.archetypeList[archetypeIndex];

    if (!archetype.componentSet.has(compType)) return null;

    return archetype.get(archetypeEntityIndex, compType);
  }

  setComponent(entityId, compType, value) {
    if (!this.entities[entityId] || !this.entities[entityId].isAlive) return;

    // Check if entity has the component
    const { archetypeIndex, archetypeEntityIndex } = this.entities[entityId];
    const archetype = this.archetypeList[archetypeIndex];

    if (!archetype.componentSet.has(compType)) {
      // Need to migrate entity to new archetype
      this.migrateEntity(entityId, [compType]);
      return;
    }

    archetype.set(archetypeEntityIndex, compType, value);
  }

  migrateEntity(entityId, newComponents) {
    // Remove components that are not in newComponents
    // Add components that are in newComponents but not in old archetype
    const { archetypeIndex, archetypeEntityIndex } = this.entities[entityId];
    const oldArchetype = this.archetypeList[archetypeIndex];

    // Get current components
    const currentComps = new Set(oldArchetype.componentSet);
    
    // Determine new component set
    const newCompSet = new Set();
    
    // Keep components that are in both old and new
    for (const comp of currentComps) {
      if (newComponents.includes(comp) || (oldArchetype.componentSet.has(comp) && !this.isRemovingComp(comp, newComponents, oldArchetype.componentSet))) {
        newCompSet.add(comp);
      }
    }
    
    // Actually, simpler approach: new components = old components + newComponents
    // But we need to handle removals too. For now, let's assume we only add.
    // This is a simplified migration
    const finalCompSet = new Set(oldArchetype.componentSet);
    for (const comp of newComponents) {
      finalCompSet.add(comp);
    }

    if (finalCompSet.size === oldArchetype.componentSet.size && 
        [...finalCompSet].every(c => oldArchetype.componentSet.has(c))) {
      return; // No change
    }

    // Create new archetype
    const newArchetype = this.createArchetype([...finalCompSet]);
    const newArchIndex = this.archetypeList.indexOf(newArchetype);
    const newIndexInArchetype = newArchetype.allocate();

    // Copy components
    for (const compType of finalCompSet) {
      if (oldArchetype.componentSet.has(compType)) {
        newArchetype.set(newIndexInArchetype, compType, oldArchetype.get(archetypeEntityIndex, compType));
      } else {
        newArchetype.set(newIndexInArchetype, compType, null); // Initialize
      }
    }

    // Free old slot
    oldArchetype.free(archetypeEntityIndex);

    // Update entity reference
    this.entities[entityId].archetypeIndex = newArchIndex;
    this.entities[entityId].archetypeEntityIndex = newIndexInArchetype;
  }

  isRemovingComp(comp, newComponents, oldCompSet) {
    // This is a placeholder for proper diff logic
    return !newComponents.includes(comp) && oldCompSet.has(comp);
  }

  addQuery(componentTypes) {
    const query = new Query(this.nextQueryId++, componentTypes);
    for (const archetype of this.archetypeList) {
      if (query.matchesArchetype(archetype)) {
        query.matchedArchetypes.push(archetype);
      }
    }
    this.queries.push(query);
    return query;
  }

  executeQuery(queryId, callback) {
    const query = this.queries[queryId];
    if (!query) return;

    for (const archetype of query.matchedArchetypes) {
      for (let i = 0; i < archetype.entities.length; i++) {
        const entityIndexInArchetype = i;
        // Find the entity ID
        // We need a reverse mapping or iterate through entities
        // For simplicity, we'll pass archetype and index
        callback(archetype, entityIndexInArchetype, query);
      }
    }
  }

  // For better performance, we should maintain a list of entity IDs per archetype
  // Let's enhance Archetype to track entity IDs

  static init() {
    // This is a global ECS instance
  }
}

// Enhanced Archetype with entity ID tracking
class ArchetypeEnhanced {
  constructor(id, componentSet, componentMasks) {
    this.id = id;
    this.componentSet = new Set(componentSet);
    this.componentMasks = componentMasks;
    this.entityIndices = []; // Index to archetype slot for each entity in this archetype
    this.entityIds = []; // The actual entity IDs
    this.slots = []; // Array of component data arrays
    this.nextSlot = 0;
    this.freeSlots = [];
  }

  allocate(entityId) {
    let slotIndex;
    if (this.freeSlots.length > 0) {
      slotIndex = this.freeSlots.pop();
    } else {
      slotIndex = this.slots.length;
      this.slots.push({});
      for (const compType of this.componentSet) {
        this.slots[slotIndex][compType] = new Array(COMP_DATA_SIZES[compType] / 4);
      }
    }
    this.entityIndices[entityId] = slotIndex;
    this.entityIds[slotIndex] = entityId;
    return slotIndex;
  }

  free(entityId) {
    const slotIndex = this.entityIndices[entityId];
    if (slotIndex === undefined) return;
    
    delete this.entityIndices[entityId];
    this.freeSlots.push(slotIndex);
    // Optionally clean up entityIds
  }

  get(entityId, compType) {
    const slotIndex = this.entityIndices[entityId];
    if (slotIndex === undefined) return null;
    return this.slots[slotIndex][compType];
  }

  set(entityId, compType, value) {
    const slotIndex = this.entityIndices[entityId];
    if (slotIndex === undefined) return;
    this.slots[slotIndex][compType] = value;
  }

  forEach(callback) {
    for (let i = 0; i < this.entityIds.length; i++) {
      if (this.entityIds[i] !== undefined) {
        callback(this.entityIds[i], i, this);
      }
    }
  }
}

// Re-define ECS to use ArchetypeEnhanced
class ECSEnhanced {
  constructor() {
    this.entities = new Map(); // entityId -> { archetype, slotIndex, isAlive }
    this.maxEntities = 2048;
    this.freeEntityIds = [];
    this.entityCounter = 0;
    this.archetypes = [];
    this.archetypeMap = new Map(); // mask -> archetype
    this.queries = [];
    this.nextQueryId = 0;
  }

  createArchetype(componentTypes) {
    let mask = 0;
    for (const compType of componentTypes) {
      mask |= (1 << compType);
    }

    if (this.archetypeMap.has(mask)) {
      return this.archetypeMap.get(mask);
    }

    const archetype = new ArchetypeEnhanced(this.archetypes.length, componentTypes, mask);
    this.archetypes.push(archetype);
    this.archetypeMap.set(mask, archetype);
    return archetype;
  }

  createEntity(componentTypes = []) {
    const archetype = this.createArchetype(componentTypes);
    
    let entityId;
    if (this.freeEntityIds.length > 0) {
      entityId = this.freeEntityIds.pop();
    } else {
      entityId = this.entityCounter++;
    }

    const slotIndex = archetype.allocate(entityId);
    
    this.entities.set(entityId, {
      archetype: archetype,
      slotIndex: slotIndex,
      isAlive: true
    });

    return entityId;
  }

  destroyEntity(entityId) {
    const entityData = this.entities.get(entityId);
    if (!entityData || !entityData.isAlive) return;

    entityData.archetype.free(entityId);
    entityData.isAlive = false;
    this.entities.delete(entityId);
    this.freeEntityIds.push(entityId);
  }

  getComponent(entityId, compType) {
    const entityData = this.entities.get(entityId);
    if (!entityData || !entityData.isAlive) return null;

    if (!entityData.archetype.componentSet.has(compType)) return null;

    return entityData.archetype.get(entityId, compType);
  }

  setComponent(entityId, compType, value) {
    const entityData = this.entities.get(entityId);
    if (!entityData || !entityData.isAlive) return;

    if (!entityData.archetype.componentSet.has(compType)) {
      // Need to add component - migrate to new archetype
      this.addComponentToEntity(entityId, compType);
      // Set the value
      this.setComponent(entityId, compType, value);
      return;
    }

    entityData.archetype.set(entityId, compType, value);
  }

  addComponentToEntity(entityId, compType) {
    const entityData = this.entities.get(entityId);
    if (!entityData || !entityData.isAlive) return;

    const oldArchetype = entityData.archetype;
    const newCompSet = new Set(oldArchetype.componentSet);
    newCompSet.add(compType);

    const newArchetype = this.createArchetype([...newCompSet]);

    // Copy data
    if (newArchetype !== oldArchetype) {
      const oldSlotIndex = entityData.slotIndex;
      const newSlotIndex = newArchetype.allocate(entityId);

      for (const compTypeOfNew of newArchetype.componentSet) {
        if (oldArchetype.componentSet.has(compTypeOfNew)) {
          newArchetype.set(entityId, compTypeOfNew, oldArchetype.get(entityId, compTypeOfNew));
        } else {
          newArchetype.set(entityId, compTypeOfNew, null);
        }
      }

      oldArchetype.free(entityId);

      this.entities.set(entityId, {
        archetype: newArchetype,
        slotIndex: newSlotIndex,
        isAlive: true
      });
    }
  }

  removeComponentFromEntity(entityId, compType) {
    const entityData = this.entities.get(entityId);
    if (!entityData || !entityData.isAlive) return;

    const oldArchetype = entityData.archetype;
    if (!oldArchetype.componentSet.has(compType)) return;

    const newCompSet = new Set(oldArchetype.componentSet);
    newCompSet.delete(compType);

    const newArchetype = this.createArchetype([...newCompSet]);

    if (newArchetype !== oldArchetype) {
      const oldSlotIndex = entityData.slotIndex;
      const newSlotIndex = newArchetype.allocate(entityId);

      for (const compTypeOfNew of newArchetype.componentSet) {
        if (oldArchetype.componentSet.has(compTypeOfNew)) {
          newArchetype.set(entityId, compTypeOfNew, oldArchetype.get(entityId, compTypeOfNew));
        } else {
          newArchetype.set(entityId, compTypeOfNew, null);
        }
      }

      oldArchetype.free(entityId);

      this.entities.set(entityId, {
        archetype: newArchetype,
        slotIndex: newSlotIndex,
        isAlive: true
      });
    }
  }

  addQuery(componentTypes) {
    const query = {
      id: this.nextQueryId++,
      componentTypes: componentTypes,
      mask: 0,
      matchedArchetypes: []
    };

    for (const compType of componentTypes) {
      query.mask |= (1 << compType);
    }

    for (const archetype of this.archetypes) {
      if (this.matchesQuery(archetype, query)) {
        query.matchedArchetypes.push(archetype);
      }
    }

    this.queries.push(query);
    return query;
  }

  matchesQuery(archetype, query) {
    for (const compType of query.componentTypes) {
      if (!archetype.componentSet.has(compType)) {
        return false;
      }
    }
    return true;
  }

  forEach(query, callback) {
    for (const archetype of query.matchedArchetypes) {
      archetype.forEach((entityId, slotIndex, arch) => {
        callback(entityId, slotIndex, arch, query);
      });
    }
  }

  queryEntityIds(query) {
    const result = [];
    this.forEach(query, (entityId) => {
      result.push(entityId);
    });
    return result;
  }
}

// Export the ECS system
export const ECS = ECSEnhanced;
export const ComponentTypes = ComponentTypes;
export const COMP_DATA_SIZES = COMP_DATA_SIZES;
