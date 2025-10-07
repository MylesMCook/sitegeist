# Slack Message Collection & Sending Guide

## Description

This library provides utilities to:
1. **Collect messages** from Slack's virtual list (which loads dynamically as you scroll)
2. **Send messages** to the current channel or DM, with support for @mentions

**Key Features:**
- Scroll-based collection that handles Slack's virtual list rendering
- Time-range filtering (e.g., last 24 hours)
- Automatic deduplication
- Message sending with proper event triggering
- Support for @mentions

---

## Usage Examples

### Collecting Messages

```javascript
// Collect messages from the last 24 hours
const messages = await window.slackUtils.collectFromBottomUp(24);

// Format output: timestamp | author | message
const output = messages.map(msg => {
  const time = new Date(msg.timestamp * 1000);
  const timeStr = `${time.getMonth()+1}/${time.getDate()} ${time.getHours()}:${String(time.getMinutes()).padStart(2,'0')}`;
  const author = msg.author || '?';
  let text = msg.text.replace(/^\s*\S+\s+\d{1,2}:\d{2}\s+(AM|PM)\s*\n*/i, '').trim();
  return `${timeStr} | ${author} | ${text}`;
}).join('\n');

return output;
```

### Sending Messages

```javascript
// Send a simple message
await window.slackUtils.sendMessage("Hello everyone!");

// Send a message with @mentions
await window.slackUtils.sendMessage("@davide @nate Thanks for the update!");
```

---

## Code Library

Install this once per session:

```javascript
window.slackUtils = {
  
  // Collect messages from currently visible DOM
  collectVisibleMessages: function() {
    const messageList = document.querySelector("#message-list");
    const messageItems = messageList?.querySelectorAll('[data-qa="virtual-list-item"]');
    const messages = [];
    
    messageItems?.forEach(item => {
      const dataKey = item.getAttribute('data-item-key');
      const timestampMatch = dataKey?.match(/^(\d+\.\d+)/);
      
      if (timestampMatch) {
        const timestamp = parseFloat(timestampMatch[1]);
        const authorElement = item.querySelector('[data-message-sender]');
        
        messages.push({
          timestamp,
          dataKey,
          author: authorElement?.innerText || null,
          text: item.innerText
        });
      }
    });
    
    return messages;
  },
  
  // Scroll from bottom upward, collecting messages until we hit time threshold
  collectFromBottomUp: async function(hoursBack = 24) {
    const scrollableElement = document.querySelector("#message-list > div.c-scrollbar__hider");
    if (!scrollableElement) {
      throw new Error("Scrollable element not found");
    }
    
    const now = Date.now() / 1000;
    const threshold = now - (hoursBack * 60 * 60);
    
    console.log(`Collecting messages from last ${hoursBack} hours`);
    
    // Scroll to absolute bottom first
    scrollableElement.scrollTop = 999999999;
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const viewportHeight = scrollableElement.clientHeight;
    const allMessages = new Map();
    let hitThreshold = false;
    let iterations = 0;
    const maxIterations = 200;
    
    while (!hitThreshold && iterations < maxIterations) {
      const visibleMessages = this.collectVisibleMessages();
      
      visibleMessages.forEach(msg => {
        allMessages.set(msg.dataKey, msg);
        if (msg.timestamp < threshold) {
          hitThreshold = true;
        }
      });
      
      if (hitThreshold) break;
      
      const beforeScroll = scrollableElement.scrollTop;
      scrollableElement.scrollBy(0, -viewportHeight);
      await new Promise(resolve => setTimeout(resolve, 600));
      
      if (scrollableElement.scrollTop === beforeScroll || scrollableElement.scrollTop === 0) {
        console.log("Reached top of messages");
        break;
      }
      
      iterations++;
      if (iterations % 10 === 0) {
        console.log(`Collected ${allMessages.size} messages so far...`);
      }
    }
    
    const messagesArray = Array.from(allMessages.values());
    messagesArray.sort((a, b) => a.timestamp - b.timestamp);
    const filteredMessages = messagesArray.filter(msg => msg.timestamp >= threshold);
    
    console.log(`Collected ${filteredMessages.length} messages within range`);
    return filteredMessages;
  },
  
  // Send a message to the current channel/DM
  sendMessage: async function(text) {
    const editableDiv = document.querySelector('.ql-editor[contenteditable="true"]');
    const sendButton = document.querySelector('[data-qa="texty_send_button"]');
    
    if (!editableDiv || !sendButton) {
      throw new Error('Could not find message input or send button');
    }
    
    // Focus and set content
    editableDiv.focus();
    editableDiv.innerHTML = `<p>${text}</p>`;
    
    // Trigger input event
    const inputEvent = new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: text
    });
    editableDiv.dispatchEvent(inputEvent);
    
    // Wait for Slack to process the content
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Click send
    sendButton.click();
    
    console.log('Message sent:', text);
    return true;
  }
};

return "Slack utilities installed on window.slackUtils";
```
