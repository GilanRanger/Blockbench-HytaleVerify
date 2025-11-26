(function() {

  Plugin.register('hytale_verifier', {
    title: 'Hytale Model Verifier',
    author: 'Gilan',
    description: 'Verifies whether a model has the correct resolution for the Hytale art-style',
    icon: 'verified',
    version: '1.2.0',
    variant: 'both',
    
    onload() {
      let modelVerify = new Action('hytale_model_verify', {
        name: 'Verify Hytale Model',
        description: 'Click to verify if your Model has the correct texture resolution (1 pixel = 1 world unit)',
        icon: 'view_in_ar',
        click() {
          verifyHytaleModel();
        }
      });

      let meshToCube = new Action('hytale_mesh_to_cube', {
        name: 'Convert Meshes to Cubes',
        description: 'Converts cuboid meshes to cubes while preserving UVs and properties',
        icon: 'transform',
        click() {
          convertMeshesToCubes();
        }
      });
      
      MenuBar.addAction(modelVerify, 'tools');
      MenuBar.addAction(meshToCube, 'tools');
    },
    
    onunload() {
      entityItemVerify.delete();
      blockVerify.delete();
      meshToCube.delete();
    }
  });

  function verifyHytaleModel() {
    verifyModel(32, 'Model');
  }

  function isMeshCuboid(mesh) {
    if (!mesh.vertices) return false;
    
    let vertexArray = Object.values(mesh.vertices);
    if (vertexArray.length === 0) return false;
    if (vertexArray.length !== 8 && vertexArray.length !== 4) return false;
    
    if (vertexArray.length === 4) {
      let xVals = vertexArray.map(v => v[0]);
      let yVals = vertexArray.map(v => v[1]);
      let zVals = vertexArray.map(v => v[2]);
      
      let xUnique = [...new Set(xVals)].length;
      let yUnique = [...new Set(yVals)].length;
      let zUnique = [...new Set(zVals)].length;
      
      return (xUnique === 1 || yUnique === 1 || zUnique === 1);
    }
    
    let xVals = vertexArray.map(v => v[0]);
    let yVals = vertexArray.map(v => v[1]);
    let zVals = vertexArray.map(v => v[2]);
    
    let xUnique = [...new Set(xVals.map(v => Math.round(v * 1000)))].length;
    let yUnique = [...new Set(yVals.map(v => Math.round(v * 1000)))].length;
    let zUnique = [...new Set(zVals.map(v => Math.round(v * 1000)))].length;
    
    return (xUnique === 2 || xUnique === 1) && 
           (yUnique === 2 || yUnique === 1) && 
           (zUnique === 2 || zUnique === 1);
  }

  function convertMeshesToCubes() {
    let converted = 0;
    let skipped = 0;
    let meshesToConvert = [];

    Mesh.all.forEach(mesh => {
      if (!mesh.visibility) {
        skipped++;
        return;
      }
      
      if (!isMeshCuboid(mesh)) {
        skipped++;
        return;
      }
      
      meshesToConvert.push(mesh);
    });
    
    if (meshesToConvert.length === 0) {
      Blockbench.showQuickMessage('No cuboid meshes found to convert', 2000);
      return;
    }
    
    Undo.initEdit({elements: meshesToConvert, outliner: true});
    
    let createdCubes = [];
    
    meshesToConvert.forEach(mesh => {
      try {
        let vertexArray = Object.values(mesh.vertices);
        
        let xVals = vertexArray.map(v => v[0]);
        let yVals = vertexArray.map(v => v[1]);
        let zVals = vertexArray.map(v => v[2]);

        let minX = Math.min(...xVals);
        let maxX = Math.max(...xVals);
        let minY = Math.min(...yVals);
        let maxY = Math.max(...yVals);
        let minZ = Math.min(...zVals);
        let maxZ = Math.max(...zVals);

        let matrix = eulerXYZToMatrix(mesh.rotation[0], mesh.rotation[1], mesh.rotation[2]);
        let cubeRotation = matrixToEulerZYX(matrix);
        
        let parent = mesh.parent;

        let cube = new Cube({
          name: mesh.name,
          color: mesh.color,
          origin: mesh.position.slice(),
          rotation: cubeRotation,
          visibility: mesh.visibility,
          locked: mesh.locked,
          export: mesh.export,
          render_order: mesh.render_order,
          allow_mirror_modeling: mesh.allow_mirror_modeling,
          from: [
            minX + mesh.position[0],
            minY + mesh.position[1],
            minZ + mesh.position[2]
          ],
          to: [
            maxX + mesh.position[0],
            maxY + mesh.position[1],
            maxZ + mesh.position[2]
          ]
        }).init();
        
        if (mesh.faces) {
          copyMeshFacesToCube(mesh, cube);
        }
        
        if (parent === 'root') {
          cube.addTo();
        } else {
          cube.addTo(parent);
        }
        
        createdCubes.push(cube);
        mesh.remove();
        converted++;
      } catch (e) {
        console.error('Error converting mesh:', e);
        skipped++;
      }
    });
    
    Undo.finishEdit('Convert meshes to cubes', {elements: createdCubes, outliner: true});
    
    Canvas.updateAll();
    updateSelection();
    
    Blockbench.showQuickMessage('Converted all cuboid and plane meshes to cubes.', 3000);
  }

  function copyMeshFacesToCube(mesh, cube) {
    // Map mesh faces to cube faces based on face normals
    for (let faceKey in mesh.faces) {
      let meshFace = mesh.faces[faceKey];
      
      if (!meshFace.vertices || meshFace.vertices.length === 0) continue;
      
      let faceVertices = meshFace.vertices.map(vKey => mesh.vertices[vKey]);
      
      let normal = calculateFaceNormal(faceVertices);
      let cubeFaceKey = getCubeFaceFromNormal(normal);
      
      if (cubeFaceKey && cube.faces[cubeFaceKey]) {
        let cubeFace = cube.faces[cubeFaceKey];
        
        if (meshFace.texture !== null && meshFace.texture !== undefined) {
          cubeFace.texture = meshFace.texture;
        }
        
        if (meshFace.uv) {
          let uvCoords = meshFace.vertices.map(vKey => meshFace.uv[vKey]);
          
          if (uvCoords.length > 0 && uvCoords[0]) {
            let minU = Math.min(...uvCoords.map(uv => uv[0]));
            let maxU = Math.max(...uvCoords.map(uv => uv[0]));
            let minV = Math.min(...uvCoords.map(uv => uv[1]));
            let maxV = Math.max(...uvCoords.map(uv => uv[1]));
            
            cubeFace.uv = [minU, minV, maxU, maxV];
          }
        }
      }
    }
  }

  function calculateFaceNormal(vertices) {
    if (vertices.length < 3) return [0, 0, 0];
    
    let v1 = vertices[0];
    let v2 = vertices[1];
    let v3 = vertices[2];
    
    let edge1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
    let edge2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
    
    let normal = [
      edge1[1] * edge2[2] - edge1[2] * edge2[1],
      edge1[2] * edge2[0] - edge1[0] * edge2[2],
      edge1[0] * edge2[1] - edge1[1] * edge2[0]
    ];
    
    let length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
    if (length > 0) {
      normal = [normal[0] / length, normal[1] / length, normal[2] / length];
    }
    
    return normal;
  }

  function getCubeFaceFromNormal(normal) {
    let absX = Math.abs(normal[0]);
    let absY = Math.abs(normal[1]);
    let absZ = Math.abs(normal[2]);
    
    let maxAbs = Math.max(absX, absY, absZ);
    
    const threshold = 0.5;
    
    if (maxAbs < threshold) return null;
    
    if (absX === maxAbs) {
      return normal[0] > 0 ? 'east' : 'west';
    } else if (absY === maxAbs) {
      return normal[1] > 0 ? 'up' : 'down';
    } else if (absZ === maxAbs) {
      return normal[2] > 0 ? 'south' : 'north';
    }
    
    return null;
  }

  function verifyModel(expectedDensity, modelType) {
    let issues = [];
    let meshIssues = {};
    
    Outliner.elements.forEach(element => {
      if (!element.visibility) return;
      
      if (element.type === 'mesh') {
        if (!isMeshCuboid(element)) {
          let vertexCount = element.vertices ? Object.keys(element.vertices).length : 0;
          issues.push({
            name: element.name,
            resolution: `Invalid mesh shape (${vertexCount} vertices)`,
            expected: 'Must be a cuboid or plane'
          });
        }
      } else if (element.type !== 'cube') {
        issues.push({
          name: element.name,
          resolution: `Invalid element type: ${element.type}`,
          expected: 'Must be a cube or mesh cuboid/plane'
        });
        return;
      }
      
      if (element.type === 'cube') {
        let size = [element.size(0), element.size(1), element.size(2)];
        let zeroCount = size.filter(s => s === 0).length;
        
        if (zeroCount !== 0 && zeroCount !== 1) {
          issues.push({
            name: element.name,
            resolution: `Invalid shape (dimensions: ${size[0].toFixed(2)}x${size[1].toFixed(2)}x${size[2].toFixed(2)})`,
            expected: 'Must be a box or plane'
          });
        }
      }
    });
    
    Cube.all.forEach(cube => {
      if (!cube.visibility) return;
      
      for (let faceKey in cube.faces) {
        let face = cube.faces[faceKey];
        if (face.texture !== null && face.texture !== undefined) {
          let texture = Texture.all.find(t => t.uuid === face.texture);
          if (texture) {
            let uvWidth = Math.abs(face.uv[2] - face.uv[0]);
            let uvHeight = Math.abs(face.uv[3] - face.uv[1]);
            
            let textureUVWidth = texture.uv_width || texture.width || 16;
            let textureUVHeight = texture.uv_height || texture.height || 16;
            
            let uvScaleX = (texture.width || 128) / textureUVWidth;
            let uvScaleY = (texture.height || 128) / textureUVHeight;
            
            let actualPixelsWidth = uvWidth * uvScaleX;
            let actualPixelsHeight = uvHeight * uvScaleY;
            
            let faceSize = getFaceSize(cube, faceKey);
            
            let pixelsNeededWidth = (faceSize.width / 16) * expectedDensity;
            let pixelsNeededHeight = (faceSize.height / 16) * expectedDensity;
            
            if (Math.abs(actualPixelsWidth - pixelsNeededWidth) > 1 || Math.abs(actualPixelsHeight - pixelsNeededHeight) > 1) {
              issues.push({
                name: `${cube.name} (${faceKey} face)`,
                resolution: `${actualPixelsWidth.toFixed(1)}x${actualPixelsHeight.toFixed(1)} pixels (need ${pixelsNeededWidth.toFixed(1)}x${pixelsNeededHeight.toFixed(1)})`,
                expected: `1:1 pixel density`
              });
            }
          }
        }
      }
    });
    
    if (Mesh.all) {
      Mesh.all.forEach(mesh => {
        if (!mesh.visibility) return;
        
        if (mesh.faces) {
          for (let faceKey in mesh.faces) {
            let face = mesh.faces[faceKey];
            
            if (face.vertices && face.vertices.length > 0 && face.texture && face.uv) {
              let texture = Texture.all.find(t => t.uuid === face.texture);
              if (texture) {
                let faceVertices = face.vertices.map(vKey => mesh.vertices[vKey]);
                
                let xRange = Math.max(...faceVertices.map(v => v[0])) - Math.min(...faceVertices.map(v => v[0]));
                let yRange = Math.max(...faceVertices.map(v => v[1])) - Math.min(...faceVertices.map(v => v[1]));
                let zRange = Math.max(...faceVertices.map(v => v[2])) - Math.min(...faceVertices.map(v => v[2]));
                
                let worldDimensions = [xRange, yRange, zRange].filter(d => d > 0.01).sort((a,b) => b - a);
                
                let uvCoords = face.vertices.map(vKey => face.uv[vKey]);
                
                if (uvCoords.length > 0 && uvCoords[0]) {
                  let uRange = Math.max(...uvCoords.map(uv => uv[0])) - Math.min(...uvCoords.map(uv => uv[0]));
                  let vRange = Math.max(...uvCoords.map(uv => uv[1])) - Math.min(...uvCoords.map(uv => uv[1]));
                  
                  let uvDimensions = [uRange, vRange].sort((a,b) => b - a);
                  
                  let textureUVWidth = texture.uv_width || texture.width || 16;
                  let textureUVHeight = texture.uv_height || texture.height || 16;
                  
                  let uvScaleX = (texture.width || 128) / textureUVWidth;
                  let uvScaleY = (texture.height || 128) / textureUVHeight;
                  
                  let actualPixels = [
                    uvDimensions[0] * uvScaleX,
                    uvDimensions[1] * uvScaleY
                  ].sort((a,b) => b - a);
                  
                  let pixelsNeeded = [
                    (worldDimensions[0] / 16) * expectedDensity,
                    (worldDimensions[1] / 16) * expectedDensity
                  ].sort((a,b) => b - a);
                  
                  if (Math.abs(actualPixels[0] - pixelsNeeded[0]) > 1 || Math.abs(actualPixels[1] - pixelsNeeded[1]) > 1) {
                    if (!meshIssues[mesh.name]) {
                      meshIssues[mesh.name] = {
                        count: 0,
                        example: {
                          resolution: `${actualPixels[0].toFixed(1)}x${actualPixels[1].toFixed(1)} pixels (need ${pixelsNeeded[0].toFixed(1)}x${pixelsNeeded[1].toFixed(1)})`,
                          expected: `${expectedDensity}px density`
                        }
                      };
                    }
                    meshIssues[mesh.name].count++;
                  }
                }
              }
            }
          }
        }
      });
    }
    
    for (let meshName in meshIssues) {
      let meshIssue = meshIssues[meshName];
      let additionalText = meshIssue.count > 1 ? ` (+${meshIssue.count - 1} other face${meshIssue.count > 2 ? 's' : ''})` : '';
      issues.push({
        name: `${meshName}${additionalText}`,
        resolution: meshIssue.example.resolution,
        expected: meshIssue.example.expected
      });
    }
    
    if (issues.length === 0) {
      Blockbench.showQuickMessage(`${modelType} verified! All textures are correct density.`, 3000);
    } else {
      const maxDisplay = 8;
      let displayIssues = issues.slice(0, maxDisplay);
      let remainingCount = issues.length - maxDisplay;
      
      let message = `Found ${issues.length} issue(s) with ${modelType} model (expected 1:1 pixel density):\n\n`;
      displayIssues.forEach(issue => {
        message += ` - ${issue.name}: ${issue.resolution} (Expected: ${issue.expected})\n`;
      });
      
      if (remainingCount > 0) {
        message += `\n...and ${remainingCount} more issue(s)`;
      }
      
      Blockbench.showMessageBox({
        title: `${modelType} Verification Issues`,
        message: message,
        icon: 'warning'
      });
    }
  }
  
  function getFaceSize(cube, faceKey) {
    let size = [cube.size(0), cube.size(1), cube.size(2)];
    switch(faceKey) {
      case 'north':
      case 'south':
        return { width: size[0], height: size[1] };
      case 'east':
      case 'west':
        return { width: size[2], height: size[1] };
      case 'up':
      case 'down':
        return { width: size[0], height: size[2] };
    }
  }

  function eulerXYZToMatrix(rx, ry, rz) {
    rx = rx * Math.PI / 180;
    ry = ry * Math.PI / 180;
    rz = rz * Math.PI / 180;
    
    let cx = Math.cos(rx), sx = Math.sin(rx);
    let cy = Math.cos(ry), sy = Math.sin(ry);
    let cz = Math.cos(rz), sz = Math.sin(rz);
    
    return [
      [cy*cz, -cy*sz, sy],
      [cx*sz + sx*sy*cz, cx*cz - sx*sy*sz, -sx*cy],
      [sx*sz - cx*sy*cz, sx*cz + cx*sy*sz, cx*cy]
    ];
  }

  function matrixToEulerZYX(m) {
    let y = Math.asin(-m[2][0]);
    let x, z;
    
    if (Math.abs(m[2][0]) < 0.99999) {
      x = Math.atan2(m[2][1], m[2][2]);
      z = Math.atan2(m[1][0], m[0][0]);
    } else {
      x = Math.atan2(-m[1][2], m[1][1]);
      z = 0;
    }
    
    return [
      x * 180 / Math.PI,
      y * 180 / Math.PI,
      z * 180 / Math.PI
    ];
  }

})();