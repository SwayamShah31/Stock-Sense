import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { createMailer } from './email.js';
import { emitRealtimeEvent } from './realtime.js';

function buildEmailBody({ title, message, type }) {
  return [
    `Title: ${title}`,
    `Type: ${type || 'info'}`,
    '',
    message,
  ].join('\n');
}

export async function createNotificationWithEmail({ shopId, title, message, type = 'info' }) {
  const notification = await Notification.create({
    shop: shopId,
    title,
    message,
    type,
  });

  const shopOwner = await User.findById(shopId).select('email name shopName');
  const mailer = createMailer();
  const recipientEmail = process.env.NOTIFICATION_EMAIL || shopOwner?.email;

  emitRealtimeEvent('notification:new', notification.toObject());

  if (mailer && recipientEmail && process.env.SMTP_FROM) {
    try {
      await mailer.sendMail({
        from: process.env.SMTP_FROM,
        to: recipientEmail,
        subject: `StockSense AI: ${title}`,
        text: buildEmailBody({ title, message, type }),
      });
    } catch (error) {
      console.warn('Notification email failed:', error.message);
    }
  }

  return notification;
}