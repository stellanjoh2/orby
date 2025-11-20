// Utility to load GLSL shader files
// Note: In a browser environment, we'll need to inline these or use a bundler
// For now, we'll keep them as template strings that can be replaced

export async function loadShader(vertexPath, fragmentPath) {
  // In a real implementation, you'd fetch these files
  // For now, we'll return the paths and let the caller handle loading
  // This is a placeholder for future bundler integration
  return {
    vertexPath,
    fragmentPath,
  };
}

// For now, we'll use a synchronous approach with template strings
// This will be replaced when we add a bundler or fetch-based loader
export function getShaderSource(name) {
  // This will be populated by a build step or kept as inline strings
  // For now, return null to indicate we're using inline shaders
  return null;
}

