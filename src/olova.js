// Style injection utility
let styleSheet = null;

export function injectStyle(css) {
  if (!styleSheet) {
    // Create a new style element if it doesn't exist
    styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    document.head.appendChild(styleSheet);
  }

  // Insert the CSS rules
  styleSheet.textContent += css;
}

// Helper function to find all text nodes in a DOM tree
function getTextNodes(node) {
  const textNodes = [];
  if (node.nodeType === Node.TEXT_NODE) {
    textNodes.push(node);
  } else {
    for (const child of node.childNodes) {
      textNodes.push(...getTextNodes(child));
    }
  }
  return textNodes;
}

// Helper function to make data reactive
function makeReactive(data, onChange) {
  const reactiveData = {};
  for (const key in data) {
    let value = data[key];
    Object.defineProperty(reactiveData, key, {
      get() {
        return value;
      },
      set(newValue) {
        value = newValue;
        onChange(key, newValue);
      },
    });
  }
  return reactiveData;
}

// Create a unique ID for each component instance
let componentInstanceCounter = 0;
function getUniqueComponentId() {
  return `component-${componentInstanceCounter++}`;
}

// Store component instances for parent-child communication
const componentInstances = new Map();

// Global registry to track component DOM elements
const componentElements = new Map();

// Store child component instances by parent ID
const childComponents = new Map();

function createInstance(options) {
  // Generate a unique ID for this instance
  const instanceId = getUniqueComponentId();

  // Map to store text nodes bound to data keys for reactivity
  const keyToNodes = {};

  // Store prop bindings for reactivity
  const propBindings = new Map();

  // Callback to update text nodes when data changes
  const onChange = (key, newValue) => {
  
    // Update text nodes
    if (keyToNodes[key]) {
      keyToNodes[key].forEach((node) => {
        if (typeof node === "object" && node.textContent !== undefined) {
          node.textContent = newValue;
        } else if (typeof node === "object" && typeof node.set === "function") {
          node.set(newValue);
        }
      });
    }

    // Update any child components that have this prop bound
    if (propBindings.has(key)) {
      propBindings.get(key).forEach((binding) => {
        const { childInstance, propName } = binding;
        if (childInstance && childInstance.data && propName) {
          
          childInstance.data[propName] = newValue;

          // Force re-render the child component
          const childElement = componentElements.get(childInstance.id);
          if (childElement && childElement.parentNode) {
            
            const newFragment = childInstance.render();
            childElement.parentNode.replaceChild(newFragment, childElement);

            // Update the reference to the new element
            const newElement = document.querySelector(
              `[data-component-id="${childInstance.id}"]`
            );
            if (newElement) {
              componentElements.set(childInstance.id, newElement);
            }
          }
        }
      });
    }

    // Check if we need to update any child components
    if (childComponents.has(instanceId)) {
      const children = childComponents.get(instanceId);
      children.forEach((childId) => {
        const childInstance = componentInstances.get(childId);
        if (childInstance) {
        
          // Re-render the child component
          const childElement = componentElements.get(childId);
          if (childElement && childElement.parentNode) {
            const newFragment = childInstance.render();
            childElement.parentNode.replaceChild(newFragment, childElement);

            // Update the reference to the new element
            const newElement = document.querySelector(
              `[data-component-id="${childId}"]`
            );
            if (newElement) {
              componentElements.set(childId, newElement);
            }
          }
        }
      });
    }
  };

  // Extract props from options
  const props = options.props || [];

  // Create reactive data, merging props and data
  let initialData = {};

  // Handle data function or object
  if (typeof options.data === "function") {
    try {
      initialData = options.data();
    } catch (error) {
      console.error("Error calling data function:", error);
      initialData = {};
    }
  } else if (options.data) {
    initialData = { ...options.data };
  }

  // Extract methods from options
  const methodsObj = options.methods || {};
  const methods = {};

  // Process methods
  for (const methodName in methodsObj) {
    if (typeof methodsObj[methodName] === "function") {
      methods[methodName] = methodsObj[methodName];
    } else if (typeof methodsObj[methodName] === "string") {
      try {
        // Create a function from the string
        methods[methodName] = new Function(
          `with(this) { ${methodsObj[methodName]} }`
        );
      } catch (error) {
        console.error(`Error creating method ${methodName}:`, error);
      }
    }
  }

  // Make data reactive
  const data = makeReactive(initialData, onChange);

  // Bind methods to data
  for (const methodName in methods) {
    methods[methodName] = methods[methodName].bind(data);
  }

  // Extract components from options
  const components = options.components || {};

  // Parse the template
  const template = options.template || "";

  // Render function to process the template
  function render() {
    try {
      // Create a temporary container to hold the template
      const container = document.createElement("div");
      container.innerHTML = template;

      // Create a document fragment to hold the processed template
      const fragment = document.createDocumentFragment();

      // Add all nodes from the container to the fragment
      while (container.firstChild) {
        fragment.appendChild(container.firstChild);
      }

      // Add a data-component-id attribute to the root element
      const rootElement = fragment.firstChild;
      if (rootElement && rootElement.nodeType === Node.ELEMENT_NODE) {
        rootElement.setAttribute("data-component-id", instanceId);

        // Store the element reference
        componentElements.set(instanceId, rootElement);
      }

      // Process text interpolation
      const textNodes = getTextNodes(fragment);
      for (const textNode of textNodes) {
        const text = textNode.textContent;
        if (!text.includes("{") || !text.includes("}")) {
          continue;
        }

        let currentText = "";
        let interpolationKey = "";
        let inInterpolation = false;
        const parts = [];

        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          if (char === "{" && !inInterpolation) {
            if (currentText) {
              parts.push(currentText);
              currentText = "";
            }
            inInterpolation = true;
          } else if (char === "}" && inInterpolation) {
            // Get the key and create a text node for it
            const key = interpolationKey.trim();
            if (key) {
              const valueNode = document.createTextNode(
                data[key] !== undefined ? data[key] : ""
              );
              parts.push(valueNode);

              // Store the node for reactivity
              if (!keyToNodes[key]) {
                keyToNodes[key] = [];
              }
              keyToNodes[key].push(valueNode);
            }
            inInterpolation = false;
            interpolationKey = "";
          } else if (inInterpolation) {
            interpolationKey += char;
          } else {
            currentText += char;
          }
        }

        if (currentText) {
          parts.push(currentText);
        }

        // Replace the original text node with the processed parts
        if (parts.length > 0) {
          const parent = textNode.parentNode;
          if (parent) {
            const fragment = document.createDocumentFragment();
            parts.forEach((part) => {
              if (typeof part === "string") {
                fragment.appendChild(document.createTextNode(part));
              } else {
                fragment.appendChild(part);
              }
            });
            parent.replaceChild(fragment, textNode);
          }
        }
      }

      // Process event handlers and v-bind directives
      const allElements = fragment.querySelectorAll("*");
      for (const element of allElements) {
        // Process event handlers (onclick, etc.)
        for (const attr of Array.from(element.attributes)) {
          // Handle vanilla onclick attribute
          if (attr.name === "onclick") {
            const methodCall = attr.value.trim();

            // Extract method name from the call (handle both with and without parentheses)
            const methodName = methodCall.includes("(")
              ? methodCall.substring(0, methodCall.indexOf("("))
              : methodCall;

            // Try to find the method in the methods object
            if (methods[methodName]) {
              element.onclick = (event) => {
                methods[methodName](event);

                // Force re-render after method execution
                const rootElement = document.querySelector(
                  `[data-component-id="${instanceId}"]`
                );
                if (rootElement && rootElement.parentNode) {
                  const newFragment = render();
                  rootElement.parentNode.replaceChild(newFragment, rootElement);
                }
              };
            } else {
              // Try to create a method on the fly
              try {
                // Handle both with and without parentheses
                const code = methodCall.includes("(")
                  ? `with(this) { ${methodCall} }`
                  : `with(this) { ${methodCall}() }`;

                const dynamicMethod = new Function(code).bind(data);
                element.onclick = (event) => {
                  dynamicMethod(event);

                  // Force re-render after method execution
                  const rootElement = document.querySelector(
                    `[data-component-id="${instanceId}"]`
                  );
                  if (rootElement && rootElement.parentNode) {
                    const newFragment = render();
                    rootElement.parentNode.replaceChild(
                      newFragment,
                      rootElement
                    );
                  }
                };
              } catch (error) {
                console.warn(
                  `Error binding onclick method "${methodCall}":`,
                  error
                );
              }
            }

            // Don't remove the onclick attribute to keep it vanilla HTML
          }

          // Handle v-bind directives
          if (attr.name.startsWith("v-bind:") || attr.name.startsWith(":")) {
            const propName = attr.name.startsWith("v-bind:")
              ? attr.name.slice(7)
              : attr.name.slice(1);
            const propValue = attr.value;

            // If the value is a data property, bind it
            if (data[propValue] !== undefined) {
              element.setAttribute(propName, data[propValue]);

              // Set up reactivity for this attribute
              if (!keyToNodes[propValue]) {
                keyToNodes[propValue] = [];
              }

              // Create a special handler for attribute updates
              const updateAttribute = (newValue) => {
                element.setAttribute(propName, newValue);
              };

              // Store the update function with the key
              keyToNodes[propValue].push({
                set: updateAttribute,
              });
            } else {
              // If it's a literal value, just set it
              element.setAttribute(propName, propValue);
            }

            // Remove the directive
            element.removeAttribute(attr.name);
          }
        }
      }

      // Handle registered components
      for (const componentName of Object.keys(components)) {
        const componentElements = fragment.querySelectorAll(componentName);
        for (const componentElement of componentElements) {
          try {
            const componentDef = components[componentName];
            if (!componentDef) {
              console.error(`Component "${componentName}" is not defined`);
              continue;
            }

            // Extract props from attributes
            const props = {};
            for (const attr of Array.from(componentElement.attributes)) {
              if (
                attr.name.startsWith("v-bind:") ||
                attr.name.startsWith(":")
              ) {
                const propName = attr.name.startsWith("v-bind:")
                  ? attr.name.slice(7)
                  : attr.name.slice(1);

                // If the value is a data property, use its value
                if (data[attr.value] !== undefined) {
                  props[propName] = data[attr.value];
                } else {
                  // Otherwise use the literal value
                  props[propName] = attr.value;
                }
              } else if (
                componentDef.props &&
                componentDef.props.includes(attr.name)
              ) {
                // Handle static props
                props[attr.name] = attr.value;
              }
            }

            // Create component instance with props
            const componentOptions = {
              ...componentDef,
              data: {
                ...(componentDef.data || {}),
                ...props,
              },
            };

            const componentInstance = createInstance(componentOptions);

            // Store the component instance for parent-child communication
            componentInstances.set(componentInstance.id, componentInstance);

            // Register this component as a child of the current component
            if (!childComponents.has(instanceId)) {
              childComponents.set(instanceId, []);
            }
            childComponents.get(instanceId).push(componentInstance.id);

            // Register this component for prop updates
            for (const attr of Array.from(componentElement.attributes)) {
              if (
                attr.name.startsWith("v-bind:") ||
                attr.name.startsWith(":")
              ) {
                const propName = attr.name.startsWith("v-bind:")
                  ? attr.name.slice(7)
                  : attr.name.slice(1);
                const dataKey = attr.value;

                if (data[dataKey] !== undefined) {
                  if (!propBindings.has(dataKey)) {
                    propBindings.set(dataKey, []);
                  }

                  propBindings.get(dataKey).push({
                    childInstance: componentInstance,
                    propName,
                  });
                }
              }
            }

            const componentFragment = componentInstance.render();
            if (!componentFragment) {
              console.error(
                `Component "${componentName}" render returned null`
              );
              continue;
            }

            // Replace the component element with the rendered component
            if (componentElement.parentNode) {
              componentElement.parentNode.replaceChild(
                componentFragment,
                componentElement
              );
            }
          } catch (error) {
            console.error(`Error rendering component ${componentName}:`, error);
            // Create a fallback element to replace the component
            const errorElement = document.createElement("div");
            errorElement.textContent = `Error rendering component: ${error.message}`;
            errorElement.style.color = "red";
            errorElement.style.border = "1px solid red";
            errorElement.style.padding = "10px";
            if (componentElement.parentNode) {
              componentElement.parentNode.replaceChild(
                errorElement,
                componentElement
              );
            }
          }
        }
      }

      return fragment;
    } catch (error) {
      console.error("Error in render function:", error);
      const errorFragment = document.createDocumentFragment();
      const errorElement = document.createElement("div");
      errorElement.textContent = `Rendering error: ${error.message}`;
      errorElement.style.color = "red";
      errorElement.style.border = "1px solid red";
      errorElement.style.padding = "10px";
      errorFragment.appendChild(errorElement);
      return errorFragment;
    }
  }

  const instance = {
    render,
    data,
    id: instanceId,
    methods,
  };

  // Store the instance
  componentInstances.set(instanceId, instance);

  return instance;
}

function createApp(options) {
  const instance = createInstance(options);
  return {
    mount(selector) {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Element with selector "${selector}" not found`);
      }

      try {
        const fragment = instance.render();
        if (fragment) {
          // Clear the element first
          while (element.firstChild) {
            element.removeChild(element.firstChild);
          }
          element.appendChild(fragment);
        } else {
          console.error("Render function returned null or undefined");
          const errorElement = document.createElement("div");
          errorElement.textContent = "Error: Component rendering failed";
          errorElement.style.color = "red";
          element.appendChild(errorElement);
        }
      } catch (error) {
        console.error("Error in mount function:", error);
        const errorElement = document.createElement("div");
        errorElement.textContent = `Mount error: ${error.message}`;
        errorElement.style.color = "red";
        element.appendChild(errorElement);
      }
    },
    data: instance.data,
  };
}

export { createApp };
