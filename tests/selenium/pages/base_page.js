const fs = require('fs');
const path = require('path');
const { By, until } = require('selenium-webdriver');

const config = require('../config');

function xpathLiteral(value) {
  const text = String(value);
  if (!text.includes("'")) {
    return `'${text}'`;
  }
  if (!text.includes('"')) {
    return `"${text}"`;
  }
  return `concat('${text.replace(/'/g, "',\"'\",'")}')`;
}

class BasePage {
  constructor(driver) {
    this.driver = driver;
  }

  async goto(route) {
    const target = route.startsWith('http') ? route : `${config.frontendBaseUrl}${route}`;
    await this.driver.get(target);
  }

  async waitForUrlContains(fragment, timeoutMs = config.defaultTimeoutMs) {
    await this.driver.wait(until.urlContains(fragment), timeoutMs);
  }

  async waitForElement(locator, timeoutMs = config.defaultTimeoutMs) {
    return this.driver.wait(until.elementLocated(locator), timeoutMs);
  }

  async waitVisible(locator, timeoutMs = config.defaultTimeoutMs) {
    const element = await this.waitForElement(locator, timeoutMs);
    await this.driver.wait(until.elementIsVisible(element), timeoutMs);
    return element;
  }

  async visibleTextContains(text, timeoutMs = config.defaultTimeoutMs) {
    const locator = By.xpath(`//*[contains(normalize-space(.), ${xpathLiteral(text)})]`);
    return this.waitVisible(locator, timeoutMs);
  }

  async clickButtonByText(text, timeoutMs = config.defaultTimeoutMs) {
    await this.driver.wait(
      async () =>
        this.driver.executeScript(
          `
            const text = arguments[0];
            return Array.from(document.querySelectorAll('button')).some((button) => {
              const rect = button.getBoundingClientRect();
              const visible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(button).visibility !== 'hidden';
              return visible && !button.disabled && (button.innerText || '').includes(text);
            });
          `,
          text
        ),
      timeoutMs,
      `Không tìm thấy button khả dụng chứa text "${text}"`
    );

    const clicked = await this.driver.executeScript(
      `
        const text = arguments[0];
        const candidates = Array.from(document.querySelectorAll('button'))
          .filter((button) => {
            const rect = button.getBoundingClientRect();
            const visible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(button).visibility !== 'hidden';
            return visible && !button.disabled && (button.innerText || '').includes(text);
          })
          .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
        if (!candidates.length) return false;
        candidates[0].click();
        return true;
      `,
      text
    );

    if (!clicked) {
      throw new Error(`Không click được button chứa text "${text}"`);
    }
  }

  async clickByTitle(title, timeoutMs = config.defaultTimeoutMs) {
    const element = await this.waitVisible(By.css(`[title="${title}"]`), timeoutMs);
    await element.click();
    return element;
  }

  async clearClientState() {
    await this.goto('/login');
    await this.driver.executeScript('window.localStorage.clear(); window.sessionStorage.clear();');
    await this.driver.manage().deleteAllCookies();
  }

  async getVisibleElements(cssSelector) {
    const elements = await this.driver.findElements(By.css(cssSelector));
    const visible = [];
    for (const element of elements) {
      if (await element.isDisplayed().catch(() => false)) {
        visible.push(element);
      }
    }
    return visible;
  }

  async getBodyText() {
    return this.driver.findElement(By.css('body')).getText();
  }

  async clickRowActionByText(rowText, buttonIndex = 0) {
    const clicked = await this.driver.executeScript(
      `
        const rowText = arguments[0];
        const buttonIndex = arguments[1];
        const candidates = Array.from(document.querySelectorAll('tr, div'))
          .filter((el) => el.innerText && el.innerText.includes(rowText) && el.querySelectorAll('button').length > buttonIndex)
          .sort((a, b) => a.innerText.length - b.innerText.length);
        const row = candidates[0];
        if (!row) return false;
        row.querySelectorAll('button')[buttonIndex].click();
        return true;
      `,
      rowText,
      buttonIndex
    );

    if (!clicked) {
      throw new Error(`Không tìm thấy action button index ${buttonIndex} trong dòng chứa "${rowText}"`);
    }
  }

  async clickNearestCheckboxByText(text) {
    const clicked = await this.driver.executeScript(
      `
        const text = arguments[0];
        const candidates = Array.from(document.querySelectorAll('tr, div'))
          .filter((el) => el.innerText && el.innerText.includes(text) && el.querySelector('input[type="checkbox"]'))
          .sort((a, b) => a.innerText.length - b.innerText.length);
        const row = candidates[0];
        if (!row) return false;
        const checkbox = row.querySelector('input[type="checkbox"]');
        checkbox.click();
        return true;
      `,
      text
    );

    if (!clicked) {
      throw new Error(`Không tìm thấy checkbox gần nội dung "${text}"`);
    }
  }

  async clickCardByText(text) {
    const clicked = await this.driver.executeScript(
      `
        const text = arguments[0];
        const candidates = Array.from(document.querySelectorAll('div'))
          .filter((el) => el.innerText && el.innerText.includes(text))
          .sort((a, b) => a.innerText.length - b.innerText.length);
        const card = candidates.find((el) => {
          const style = window.getComputedStyle(el);
          return style.cursor === 'pointer' || el.onclick || el.getAttribute('role') === 'button';
        }) || candidates[0];
        if (!card) return false;
        card.click();
        return true;
      `,
      text
    );

    if (!clicked) {
      throw new Error(`Không tìm thấy card chứa "${text}"`);
    }
  }

  async closeNotificationIfPresent() {
    await this.driver.executeScript(
      `
        const buttons = Array.from(document.querySelectorAll('button'));
        const closeButton = buttons.reverse().find((button) => /Đóng|Dong|OK|Hủy|Huy/.test(button.innerText || button.getAttribute('aria-label') || ''));
        if (closeButton) closeButton.click();
      `
    );
  }

  async screenshot(tcId) {
    fs.mkdirSync(config.screenshotsDir, { recursive: true });
    const safeName = `${tcId}_${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}.png`;
    const filePath = path.join(config.screenshotsDir, safeName);
    const image = await this.driver.takeScreenshot();
    fs.writeFileSync(filePath, image, 'base64');
    return path.relative(config.rootDir, filePath);
  }
}

module.exports = {
  BasePage,
  xpathLiteral
};
