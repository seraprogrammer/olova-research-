import { createApp } from "./src/olova.js";
import Button from "./button.js";

const app = createApp({
  name: "app",
  template: `
    <div>Hello { message }</div>
    <button onclick="changeMessage">Change Message</button>
    <button-component></button-component>
  `,
  data: {
    message: "World",
    data: [
      {
        id: 1,
        name: "John Doe",
        age: 25,
      },
    ],
  },
  components: {
    "button-component": Button, // Map tag name to component definition
  },
  methods: {
    changeMessage() {
      this.message = "Hello";
    },
  },
});

app.mount("#app");
