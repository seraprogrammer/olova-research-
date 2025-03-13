
            // Generated from app.olova
            import Button from "./button.olova";
  import Counter from "./counter.olova";
  import Hello from "./hello.olova";
  import Data from "./data.olova";
  import Parent from "./parent.olova";
  import Props from "./props.olova";

  let title = "My Olova App";

  function updateTitle() {
    title = "Updated Title!";
  }
            
            // Import styles
            import './styles.css';
            
            // Import template
            const template = await fetch('./index.html').then(r => r.text());
            
            export default {
              template,
              
            };
          