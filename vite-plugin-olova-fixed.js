// Fixed version focusing on matching olova.js event handling pattern
export default function olovaPlugin() {
  return {
    name: "vite-plugin-olova",

    transform(code, id) {
      if (!id.endsWith(".olova")) return null;
      try {
        // Parse the .olova file
        const scriptMatch = code.match(/<script>([\s\S]*?)<\/script>/);
        const scriptContent = scriptMatch ? scriptMatch[1].trim() : "";

        // Get the template part (everything outside the script and style tags)
        let template = code
          .replace(/<script>[\s\S]*?<\/script>/, "")
          .replace(/<style\s*(?:scoped)?>([\s\S]*?)<\/style>/, "")
          .trim();

        // Extract style content
        const styleMatch = code.match(
          /<style\s*(?:scoped)?>([\s\S]*?)<\/style>/
        );
        const styleContent = styleMatch ? styleMatch[1].trim() : "";
        const isScoped = styleMatch && styleMatch[0].includes("scoped");

        // Generate a unique component ID for scoped styles
        const scopeId = `data-v-${generateScopeId(id)}`;

        // Process styles if they exist and are scoped
        let processedStyles = "";
        if (styleContent) {
          processedStyles = isScoped
            ? scopeStyles(styleContent, scopeId)
            : styleContent;
        }

        // Extract imports from script
        const importStatements = [];
        const componentImports = [];

        // Handle default imports first (import Name from "./file.olova")
        const scriptWithoutDefaultImports = scriptContent.replace(
          /import\s+(\w+)\s+from\s+["']([^"']*)["'];?/g,
          (match, componentName, source) => {
            if (source.endsWith(".olova")) {
              componentImports.push(componentName);
            }
            importStatements.push(match);
            return "";
          }
        );

        // Then handle named imports (import { Name } from "./file.olova")
        const scriptWithoutImports = scriptWithoutDefaultImports
          .replace(
            /import\s+\{\s*([^}]*)\s*\}\s+from\s+["']([^"']*)["'];?/g,
            (match, imports, source) => {
              if (source.endsWith(".olova")) {
                // Extract component names
                const componentNames = imports
                  .split(",")
                  .map((name) => name.trim());
                componentNames.forEach((name) => {
                  componentImports.push(name);
                });
              }
              importStatements.push(match);
              return "";
            }
          )
          .trim();

        // Extract props, variables and methods
        const propDefinitions = [];
        const dataProperties = [];
        const methods = [];

        // Extract props definition if it exists
        const propsMatch = scriptWithoutImports.match(
          /props\s*:\s*\[([\s\S]*?)\]/
        );
        if (propsMatch) {
          const propsString = propsMatch[1].trim();
          const propsList = propsString
            .split(",")
            .map((p) => p.trim().replace(/['"]/g, ""));
          propsList.forEach((prop) => {
            if (prop) {
              propDefinitions.push(`"${prop}"`);
            }
          });
        }

        // Process the script content as a whole to handle multi-line declarations
        let processedScript = scriptWithoutImports;

        // Handle variable declarations (including multi-line)
        const varRegex = /(?:let|const)\s+(\w+)\s*=\s*([\s\S]*?);/g;
        let varMatch;
        while ((varMatch = varRegex.exec(processedScript)) !== null) {
          const varName = varMatch[1];
          const varValue = varMatch[2].trim();
          // Skip if it's already defined as a prop
          if (!propDefinitions.includes(`"${varName}"`)) {
            dataProperties.push(`${varName}: ${varValue}`);
          }
        }

        // Handle function declarations
        const funcRegex = /function\s+(\w+)\s*\((.*?)\)\s*{([\s\S]*?)}/g;
        let funcMatch;
        while ((funcMatch = funcRegex.exec(processedScript)) !== null) {
          const funcName = funcMatch[1];
          const funcParams = funcMatch[2];
          const funcBody = funcMatch[3].trim();

          // Modify function body to use this.varName
          const modifiedBody = modifyFunctionBody(funcBody, [
            ...dataProperties.map((p) => p.split(":")[0].trim()),
            ...propDefinitions.map((p) => p.replace(/['"]/g, "")),
          ]);

          methods.push(
            `${funcName}: function(${funcParams}) { ${modifiedBody} }`
          );
        }

        // Process component tags in the template
        componentImports.forEach((componentName) => {
          // Convert PascalCase to kebab-case for component tags
          const kebabName = componentName
            .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
            .toLowerCase();

          // Replace self-closing tags
          template = template.replace(
            new RegExp(`<${componentName}\\s*/>`, "g"),
            `<${kebabName}></${kebabName}>`
          );

          // Replace normal tags
          template = template.replace(
            new RegExp(
              `<${componentName}(\\s+[^>]*)?>([\\s\\S]*?)</${componentName}>`,
              "g"
            ),
            `<${kebabName}$1>$2</${kebabName}>`
          );
        });

        // Process dynamic attributes (v-bind or :prop) to support props
        template = template.replace(
          /:([a-zA-Z0-9_-]+)="([^"]*?)"/g,
          (match, propName, propValue) => {
            return `v-bind:${propName}="${propValue}"`;
          }
        );

        // Safely escape curly braces in the template to prevent JavaScript syntax errors
        const processedTemplate = template.replace(
          /\{([^{}]*)\}/g,
          (match, content) => {
            return `{${content.trim()}}`;
          }
        );

        // Build components object
        const componentsObj = componentImports
          .map((name) => {
            const kebabName = name
              .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
              .toLowerCase();
            return `"${kebabName}": ${name}`;
          })
          .join(",\n    ");

        // Generate the compiled JavaScript
        const compiled = `
          ${importStatements.join("\n")}
          import { injectStyle } from "./olova.js";
          
          const component = {
            template: \`${
              isScoped
                ? addScopeToTemplate(processedTemplate, scopeId)
                : processedTemplate
            }\`,
            ${
              propDefinitions.length > 0
                ? `props: [${propDefinitions.join(", ")}],`
                : ""
            }
            data: ${
              dataProperties.length > 0
                ? `{
              ${dataProperties.join(",\n    ")}
            }`
                : "{}"
            },
            methods: ${
              methods.length > 0
                ? `{
              ${methods.join(",\n    ")}
            }`
                : "{}"
            }${
          componentsObj
            ? `,
            components: {
              ${componentsObj}
            }`
            : ""
        }
          };

          ${processedStyles ? `injectStyle(\`${processedStyles}\`);` : ""}

          export default component;
        `;

        return { code: compiled, map: null };
      } catch (error) {
        console.error(`Error processing ${id}:`, error);
        // Return a fallback module that will display the error in the browser
        return {
          code: `
            export default {
              template: \`<div style="color: red; border: 1px solid red; padding: 10px;">
                Error processing component: ${error.message.replace(
                  /`/g,
                  "\\`"
                )}
              </div>\`,
              data: {}
            };
          `,
          map: null,
        };
      }
    },
  };
}

// Helper function to modify function body to use this.varName
function modifyFunctionBody(body, dataProps) {
  let modifiedBody = body;
  dataProps.forEach((prop) => {
    // Replace assignments like "message = value" with "this.message = value"
    modifiedBody = modifiedBody.replace(
      new RegExp(`\\b${prop}\\s*=`, "g"),
      `this.${prop} =`
    );

    // Replace variable references like "message" with "this.message"
    // But be careful not to replace parts of other words
    modifiedBody = modifiedBody.replace(
      new RegExp(`\\b${prop}\\b(?!\\s*=)`, "g"),
      `this.${prop}`
    );
  });
  return modifiedBody;
}

// Helper function to generate a scope ID based on file path
function generateScopeId(filePath) {
  // Create a simple hash from the file path
  let hash = 0;
  for (let i = 0; i < filePath.length; i++) {
    const char = filePath.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

// Helper function to scope CSS selectors
function scopeStyles(styles, scopeId) {
  // Simple CSS parser to add scopeId to each selector
  return styles.replace(/([^{]*)({[^}]*})/g, (match, selector, rules) => {
    // Split multiple selectors (e.g., "h1, p, div")
    const selectors = selector.split(",").map((s) => s.trim());

    // Add scope attribute to each selector
    const scopedSelectors = selectors.map((s) => {
      // Handle pseudo-elements and pseudo-classes correctly
      if (s.includes("::") || s.includes(":")) {
        // Find the base selector and add the attribute
        const parts = s.split(/(:{1,2}[^:]*)$/);
        return `${parts[0]}[${scopeId}]${parts[1] || ""}`;
      }
      return `${s}[${scopeId}]`;
    });

    return scopedSelectors.join(", ") + rules;
  });
}

// Helper function to add scope ID attribute to all elements in template
function addScopeToTemplate(template, scopeId) {
  // Add the scope ID to all HTML elements in the template
  return template.replace(
    /<([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\s*\/?>)/g,
    (match, tag, attrs, end) => {
      // Don't add scope ID to self-closing void elements that don't accept attributes
      const voidElements = [
        "area",
        "base",
        "br",
        "col",
        "embed",
        "hr",
        "img",
        "input",
        "link",
        "meta",
        "param",
        "source",
        "track",
        "wbr",
      ];

      if (voidElements.includes(tag.toLowerCase()) && end.includes("/>")) {
        return match;
      }

      // Add the scope ID attribute
      return `<${tag}${attrs} ${scopeId}${end}`;
    }
  );
}
