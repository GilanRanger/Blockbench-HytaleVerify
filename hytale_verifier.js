(function() {

  Plugin.register('hytale_verifier', {
    title: 'Hytale Model Verifier',
    author: 'Gilan',
    description: 'Verifies whether a model has the correct resolution for the Hytale art-style',
    icon: 'verified',
    version: '1.0.0',
    variant: 'both',
    
    onload() {
      let entityItemVerify = new Action('hytale_entity_verify', {
        name: 'Verify Hytale Entity/Item',
        description: 'Click to verify if your Entity/Item Model has the correct texture resolution',
        icon: 'person',
        click() {
          verifyHytaleEntityAndItem();
        }
      });

      let blockVerify = new Action('hytale_block_verify', {
        name: 'Verify Hytale Block',
        description: 'Click to verify if your Block Model has the correct texture resolution',
        icon: 'view_in_ar',
        click() {
          verifyHytaleBlock();
        }
      });
      
      MenuBar.addAction(entityItemVerify, 'tools');
      MenuBar.addAction(blockVerify, 'tools');
    },
    
    onunload() {
      entityItemVerify.delete();
      blockVerify.delete();
    }
  });

  function verifyHytaleEntityAndItem() {
    verifyModel(64, 'Entity/Item');
  }

  function verifyHytaleBlock() {
    verifyModel(32, 'Block');
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
    
    // Check cubes
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
                expected: `${expectedDensity}px density`
              });
            }
          }
        }
      }
    });
    
    // Check meshes  
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
    
    // Convert mesh issues to regular issues
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
      Blockbench.showQuickMessage(`${modelType} model verified! All textures are ${expectedDensity}px density.`, 3000);
    } else {
      const maxDisplay = 8;
      let displayIssues = issues.slice(0, maxDisplay);
      let remainingCount = issues.length - maxDisplay;
      
      let message = `Found ${issues.length} issue(s) with ${modelType} model (expected ${expectedDensity}px density):\n\n`;
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

})();