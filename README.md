# Hytale Model Verifier

Verifies whether a model has the correct resolution for the Hytale art-style.

**This plugin is likely temporary until the Official Hytale plugin is released with many more features.**

### Setup

In Blockbench go to File > Plugins, then next to the search bar you will see a document symbol for "Load Plugin from File". Your file system will open and you will select the hytale_verifier.js file. Once the plugin is loaded it will show up in the list of Installed plugins.

To add the Verification tools to your tool bar. Go to the 3 dots that say "Toolbar" when you hover over them, next to Move, Resize, Rotate, etc. Press "Customize Toolbar" and in the search menu look up the tool names.

### Tools

The plugin comes with a "Verify Hytale Model" tool. When the verify tools are used, the plugin will check whether you only used Planes and Cuboids, and will check the resolution for all used textures. The warning screen will tell you which objects are problematic. According to Hytale Team and Blockbench, models should have a 1 pixel to 1 unit ratio.

The plugin also includes a "Convert Meshes To Cubes" which will convert any cuboids or planes into Cubes (Meshes will not be supported by the Hytale engine)

### Issues

If you run into any issues, please report them.
